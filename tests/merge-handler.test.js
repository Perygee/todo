const payloads = require('./fixtures/payloads')
const fs = require('fs')
const path = require('path')
const {gimmeRobot} = require('./helpers')
const w = any => Promise.resolve({ data: any })

const jason = {
  user: { login: 'JasonEtco', type: 'User' },
  body: 'hey'
}

const bot = body => ({
  user: { login: 'todo-dev[bot]', type: 'Bot' },
  body
})

const comment = `## Jason!\n\nhttps://github.com/JasonEtco/test/blob/f7d286aa6381bbb5045288496403d9427b0746e2/index.js#L3-L8\n\n---\n\n###### This comment was generated by [todo](https://todo.jasonet.co) based on a \`@todo\` comment in f7d286aa6381bbb5045288496403d9427b0746e2 in #10. cc @JasonEtco.\n\n<!-- probot = {"10000":{"title":"Jason!","file":"index.js","author":"JasonEtco","sha":"f7d286aa6381bbb5045288496403d9427b0746e2"}} -->`

describe('merge-handler', () => {
  it('creates issues from todos leftover in a PR', async () => {
    const {robot, github} = gimmeRobot()
    github.issues.getComments.mockReturnValueOnce(w([jason, bot(comment)]))

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.create).toHaveBeenCalledTimes(1)
  })

  it('works without a config present', async () => {
    const {robot, github} = gimmeRobot(false)
    github.issues.getComments.mockReturnValueOnce(w([jason, bot(comment)]))

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.create).toHaveBeenCalledTimes(1)
  })

  it('opens multiple issues with multiple keywords', async () => {
    const {robot, github} = gimmeRobot('multipleKeywords.yml')
    const comments = [
      '## Jason!\n\nhttps://github.com/JasonEtco/test/blob/f7d286aa6381bbb5045288496403d9427b0746e2/index.js#L3-L8\n\n---\n\n###### This comment was generated by [todo](https://todo.jasonet.co) based on a `@todo` comment in f7d286aa6381bbb5045288496403d9427b0746e2 in #10. cc @JasonEtco.\n\n<!-- probot = {"10000":{"title":"Testing!","file":"multiple-keywords.js","author":"JasonEtco","sha":"f7d286aa6381bbb5045288496403d9427b0746e2"}} -->',
      '## Jason!\n\nhttps://github.com/JasonEtco/test/blob/f7d286aa6381bbb5045288496403d9427b0746e2/index.js#L3-L8\n\n---\n\n###### This comment was generated by [todo](https://todo.jasonet.co) based on a `@todo` comment in f7d286aa6381bbb5045288496403d9427b0746e2 in #10. cc @JasonEtco.\n\n<!-- probot = {"10000":{"title":"Hello!","file":"multiple-keywords.js","author":"JasonEtco","sha":"f7d286aa6381bbb5045288496403d9427b0746e2"}} -->'
    ]
    github.issues.getComments.mockReturnValueOnce(w([bot(comments[0]), bot(comments[1])]))
    github.gitdata.getBlob.mockReturnValueOnce({
      data: {
        content: fs.readFileSync(path.join(__dirname, 'fixtures', 'files', 'multiple-keywords.js'), 'base64')
      }
    })

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.create).toHaveBeenCalledTimes(2)
  })

  it('does not create duplicate issues', async () => {
    const {robot, github} = gimmeRobot('basic.yml', { data: { items: [{ title: 'Jason!', state: 'open', body: '\n\n<!-- probot = {"10000":{"title": "Jason!","file": "index.js"}} -->`' }] } })
    github.issues.getComments.mockReturnValueOnce(w([jason, bot(comment)]))

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.create).toHaveBeenCalledTimes(0)
  })

  it('reopens closed issues', async () => {
    const {robot, github} = gimmeRobot('basic.yml', { data: { items: [{ title: 'Jason!', state: 'closed', body: '\n\n<!-- probot = {"10000":{"title": "Jason!","file": "index.js"}} -->`' }] } })
    github.issues.getComments.mockReturnValueOnce(w([jason, bot(comment)]))

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.edit).toHaveBeenCalledTimes(1)
    expect(github.issues.createComment).toHaveBeenCalledTimes(1)
    expect(github.issues.create).toHaveBeenCalledTimes(0)
  })

  it('only creates issues for files in the tree', async () => {
    const {robot, github} = gimmeRobot()
    github.issues.getComments.mockReturnValueOnce(w([jason, bot(comment)]))
    github.gitdata.getTree.mockReturnValueOnce({data: {tree: []}})

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.create).toHaveBeenCalledTimes(0)
  })

  it('parses titles and respects case-insensitive', async () => {
    const {robot, github} = gimmeRobot('caseSensitive.yml')
    const caseSensitive = comment
      .replace('"file":"index.js"', '"file":"caseinsensitive.js"')
      .replace('"title":"Jason!"', '"title":"My keyword is case insensitive!"')
    github.issues.getComments.mockReturnValueOnce(w([jason, bot(caseSensitive)]))

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.create).toHaveBeenCalledTimes(1)
  })

  it('does nothing with no matches', async () => {
    const {robot, github} = gimmeRobot('caseSensitivePizza.yml')
    github.issues.getComments.mockReturnValueOnce(w([jason, bot(comment)]))

    await robot.receive(payloads.pullRequestMerged)
    expect(github.issues.create).toHaveBeenCalledTimes(0)
  })

  it('throws when the tree is too large', async () => {
    const {robot, github} = gimmeRobot()
    robot.log.error = jest.fn()
    github.gitdata.getTree.mockReturnValueOnce({ truncated: true })
    await robot.receive(payloads.pullRequestMerged)
    expect(robot.log.error).toHaveBeenCalledWith(new Error('Tree was too large for one recursive request.'))
    expect(github.issues.create).toHaveBeenCalledTimes(0)
  })

  it('does nothing if the PR was closed without merging', async () => {
    const {robot, github} = gimmeRobot()
    await robot.receive(payloads.pullRequestClosed)
    expect(github.issues.create).toHaveBeenCalledTimes(0)
  })
})
