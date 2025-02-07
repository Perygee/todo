const { reopenClosed } = require('../templates')

/**
 * Reopen a closed issue and post a comment saying what happened and why
 * @param {object} params
 * @param {import('probot').Context} params.context
 * @param {object} params.config
 * @param {object} params.issue
 * @param {Data} data
 */
module.exports = async ({ context, config, issue }, data) => {
  if (issue.state === 'closed' && config.reopenClosed) {
    await context.octokit.issues.update(context.repo({
      issue_number: issue.number,
      state: 'open'
    }))

    const body = reopenClosed(context.repo(data))
    return context.octokit.issues.createComment(context.repo({
      issue_number: issue.number,
      body
    }))
  }
}

/**
 * @typedef Data
 * @property {string} keyword
 * @property {string} sha
 * @property {string} filename
 */
