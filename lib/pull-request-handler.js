const { comment } = require('./templates')
const { lineBreak } = require('./utils/helpers')
const checkForDuplicateIssue = require('./utils/check-for-duplicate-issue')
const mainLoop = require('./utils/main-loop')

/**
 * @param {import('probot').Context} context
 */
module.exports = async context => {
  const { pull_number: number } = context.pullRequest()
  const { data: comments } = await context.octokit.pulls.listReviewComments(context.pullRequest({ per_page: 100 }))

  return mainLoop(context, async ({
    title,
    keyword,
    sha,
    filename,
    assignedToString,
    line,
    range,
    bodyComment,
    type
  }) => {
    // This PR already has a comment for this item
    if (comments.some(c => c.body.startsWith(`## ${title}`))) {
      context.log(`Comment with title [${title}] already exists`)
      return
    }

    const alreadyOpenIssue = await checkForDuplicateIssue(context, title);

    if (type === 'del' && !alreadyOpenIssue) {
      context.log(`No issue found with name ${title}`)
      return
    }

    let body = comment(context.repo({
      title,
      body: type === 'add' ? bodyComment : `This PR may resolve #${alreadyOpenIssue.number}`,
      sha,
      assignedToString,
      number,
      line,
      filename,
      keyword
    }))

    body = lineBreak(body)
    const { owner, repo } = context.repo()
    context.log(`Creating comment [${title}] in [${owner}/${repo}#${number}] on L${line}`)
    return context.octokit.pulls.createReviewComment(context.pullRequest({
      headers: { Accept: 'application/vnd.github.comfort-fade-preview+json' },
      commit_id: sha,
      path: filename,
      line,
      side: type === 'add' ? 'RIGHT' : 'LEFT',
      body
    }))
  })
}
