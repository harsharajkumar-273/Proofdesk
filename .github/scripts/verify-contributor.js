const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = core.getInput('github-token');
    const octokit = github.getOctokit(token);
    const context = github.context;

    const prAuthor = context.payload.pull_request.user.login;
    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const prNumber = context.payload.pull_request.number;

    // Skip check for the owner themselves
    if (prAuthor === owner) {
      console.log("PR author is the repository owner. Skipping check.");
      return;
    }

    console.log(`Verifying contributor ${prAuthor} has starred and forked ${owner}/${repo}...`);

    // 1. Verify Fork
    const isFork = context.payload.pull_request.head.repo.fork;
    if (isFork) {
      console.log(`✅ Contributor has successfully forked the repository.`);
    } else {
      console.log(`Checking if contributor has a fork of the repository...`);
      try {
        const { data: forks } = await octokit.rest.repos.listForks({
          owner,
          repo,
        });
        const hasForked = forks.some(f => f.owner.login === prAuthor);
        if (hasForked) {
          console.log(`✅ Verified contributor has a fork of the repository.`);
        } else {
          // Post a comment explaining the issue
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: `⚠️ **Verification Check Failed**\n\nHi @${prAuthor}, it looks like you haven't forked this repository yet. Please fork the repository to continue with your contribution! 🍴`
          });
          
          core.setFailed(`❌ Contributor has not forked the repository.`);
          return;
        }
      } catch (err) {
        console.error("Failed to check forks list:", err.message);
      }
    }

    // 2. Verify Star
    try {
      let page = 1;
      let hasStarred = false;
      
      while (page < 10) {
        const { data: starred } = await octokit.rest.activity.listReposStarredByUser({
          username: prAuthor,
          page,
          per_page: 100
        });
        
        if (starred.length === 0) break;
        
        hasStarred = starred.some(r => r.full_name === `${owner}/${repo}`);
        if (hasStarred) break;
        page++;
      }

      if (hasStarred) {
        console.log(`✅ Contributor has starred the repository.`);
      } else {
        // Post a comment explaining the issue
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: `⚠️ **Verification Check Failed**\n\nHi @${prAuthor}, it looks like you haven't starred this repository yet. Please star the repository to show support and complete this check! ⭐`
        });
        
        core.setFailed(`❌ Contributor has not starred the repository.`);
      }
    } catch (err) {
      console.error("Failed to check stars list:", err.message);
      core.setFailed(`❌ Star verification failed. Note: If your stars are private, please make them public under Settings -> Developer settings -> Public profile.`);
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
