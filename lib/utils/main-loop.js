const parseDiff = require('parse-diff')
const shouldExcludeFile = require('./should-exclude-file')
const getDiff = require('./get-diff')
const getDetails = require('./get-details')
const checkForBody = require('./check-for-body')
const configSchema = require('./config-schema')
const generateLabel = require('./generate-label')
const { truncate } = require('./helpers')

/**
 * The main loop that runs the provided handler for each matching line
 * @param {import('probot').Context} context
 * @param {(todo: Todo) => void} handler
 */
module.exports = async (context, handler) => {
  context.todos = []

  // Get the diff for this commit or PR
  const diff = await getDiff(context)
  if (!diff) return

  // Grab the config file
  const configFile = await context.config('config.yml')
  const configValue = (configFile && configFile.todo) ? configFile.todo : {}

  const { value: config, error } = configSchema.validate(configValue)
  if (error) throw error

  const keywords = Array.isArray(config.keyword) ? config.keyword : [config.keyword]

  // Ensure that all the labels we need are present
  const labels = await generateLabel(context, config)

  // RegEx that matches lines with the configured keywords
  const regexFlags = !config.caseSensitive ? 'i' : ''
  const regex = new RegExp(`.*\\b(?<keyword>${keywords.join('|')})\\b\\s?-?:?(?<title>.*)`, regexFlags)

  // Parse the diff as files
  const files = parseDiff(diff)

  await Promise.all(files.map(async file => {
    if (shouldExcludeFile(context.log, file.to, config.exclude)) return

    // Loop through every chunk in the file
    await Promise.all(file.chunks.map(async chunk => {
      // Chunks can have multiple changes
      await Promise.all(chunk.changes.map(async (change, index) => {
        const type = change.type // Either 'add', 'del', or normal

        // Ignore lines that aren't added or removed
        if (type === 'normal') return

        // Attempt to find a matching line: TODO Something something
        const matches = regex.exec(change.content)
        if (!matches) return

        // Trim whitespace to ensure a clean title
        const title = truncate(matches.groups.title.trim())

        // This might have matched a minified file, or something
        // huge. GitHub wouldn't allow this anyway, so let's just ignore it.
        if (!title || title.length > 256) return

        // If the title isn't longer than 5 chars, it's probably not a real todo.
        if (title.length < 5) {
          context.log(`Item found but the title was too short: ${title}`)
          return
        }

        // Get the details of this commit or PR
        const line = change.ln || change.ln2
        const deets = getDetails({ context, config, chunk, line })

        const { owner, repo } = context.repo()
        context.log(`Item found [${title}] in [${owner}/${repo}] at [${deets.sha}]`)

        // Run the handler for this webhook listener
        return handler({
          keyword: matches.groups.keyword,
          bodyComment: checkForBody(chunk.changes, index, config),
          filename: file.to,
          title,
          config,
          chunk,
          index,
          labels,
          line,
          type,
          ...deets
        })
      }))
    }))
  }))
}

/**
 * @typedef {Object} Todo
 * @prop {string} keyword
 * @prop {string} bodyComment
 * @prop {string} filename
 * @prop {string} title
 * @prop {object} config
 * @prop {import('parse-diff').Chunk} chunk
 * @prop {index} index
 * @prop {string[]} labels
 * @prop {number} line
 * @prop {string} username
 * @prop {string} sha
 * @prop {string} assignedToString
 * @prop {number} number
 * @prop {string} range
 */
