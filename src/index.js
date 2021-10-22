import * as core from '@actions/core';
import * as github from '@actions/github';
import pullRequestTeams from './pullRequestTeams';

async function run() {
  try {
    // ensure we're in a pull request or in a pull request review
    ensurePullRequestOrReview();

    // setup vars
    const githubToken = core.getInput('githubToken');
    const pat = core.getInput('additionalAccessPat');
    const octokitGh = github.getOctokit(githubToken);
    const octokitPat = github.getOctokit(pat);
    const org = github.context.repo.owner;
    const repo = github.context.repo.repo;
    const prNumber = github.context.issue.number;
    const prAuthorLogin = github.context.payload.pull_request.user.login;
    const reviewersTeam = pullRequestTeams.requiredReviewers;
    const requiredReviewers = await getTeamMemberLogins(octokitPat, org, reviewersTeam.teamSlug, prAuthorLogin);
    const reviews = (await octokitGh.rest.pulls.listReviews({ owner: org, repo, pull_number: prNumber })).data;
    const hasRequiredApproval = await getHasRequiredApproval(requiredReviewers, reviews);

    // if there are no required approvals, then fail the action
    if (hasRequiredApproval === false) {
      const message = `There are no approvals from any of the required reviewers: ${requiredReviewers}`;
      core.setFailed(message);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

/**
 * Ensures this action is running in the context of a pull request or a pull request review.
 */
function ensurePullRequestOrReview() {
  core.info('Ensuring we are in the context of a pull request or pull request review ...');

  const eventName = github.context.eventName;

  if (eventName !== 'pull_request' && eventName !== 'pull_request_review') {
    const errorMessage =
      `This action should only be used on pull requests and pull request reviews! ` +
      `The current event is: ${github.context.eventName}`;

    throw errorMessage;
  }
}

/**
 * Determine if there is any approval from a required reviewer.
 * @param {Array} requiredReviewers - All required reviewers
 * @param {Array} reviews - All reviews for the pull request
 * @returns {boolean} True if there is at least 1 approved review from a required reviewer, false otherwise
 */
async function getHasRequiredApproval(requiredReviewers, reviews) {
  let hasRequiredApproval = false;

  for (let reviewer of requiredReviewers) {
    core.info(`Checking for an an approved review from ${reviewer}...`);

    // get only the reviews for the current reviewer
    const reviewerReviews = reviews.filter((o) => o.user.login === reviewer);

    // get the last review for the reviewer
    const lastReview = reviewerReviews[reviewerReviews.length - 1];

    // if the last review for the reviewer is approved, then we have an approval
    // if true, we can break out of the loop because we only care if we have at least 1 approved review
    if (lastReview.state.toLowerCase() === 'approved') {
      core.info(`An approved review was found from ${reviewer}...`);
      hasRequiredApproval = true;
      break;
    }

    core.info(`No approved review was found from ${reviewer}...`);
  }

  return hasRequiredApproval;
}

/**
 * Gets the logins for all members of a team.
 * @param {object} octokit - The octokit client to use for making api calls
 * @param {string} org - The github organization name
 * @param {string} teamSlug - The slug for the team
 * @param {string} prAuthorLogin - (optional) The PR author's login (to be filtered out)
 * @returns {Array} The logins for each member of the team
 */
async function getTeamMemberLogins(octokit, org, teamSlug, prAuthorLogin) {
  core.info(`Getting the team members for the ${teamSlug} team...`);

  // get all of the team members' logins
  const response = await octokit.rest.teams.listMembersInOrg({ org: org, team_slug: teamSlug });
  let logins = response.data.map((o) => o.login);

  // filter out the pr author's login if it has a value
  if (prAuthorLogin) {
    core.info('Filtering out the pull request author from the team members...');
    logins = logins.filter((o) => o !== prAuthorLogin);
  }

  core.info(`The following logins were found for the team: ${logins}`);

  return logins;
}

run();
