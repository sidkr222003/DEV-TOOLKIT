# Contributing to Dev Toolkit

Thank you for contributing! This guide explains how to work with the repository, branch rules, and pull requests.

## Branch Protection Rules
- `main` is the protected release branch.
- Always branch from `main` using descriptive names like `feature/code-explainer` or `fix/remove-console-logs`.
- Do not push directly to `main`.
- Use pull requests for all changes.
- Require at least one review before merging.
- Require status checks to pass before merge.

## Development Workflow
1. Fork the repository or work in a feature branch.
2. Create a new branch for your work:
   - `feature/<description>`
   - `fix/<description>`
   - `docs/<description>`
3. Make your changes and run `npm install` if needed.
4. Run `npm run compile` before committing.
5. Open a pull request and reference the milestone or issue.

## Pull Request Checklist
- [ ] Code compiles successfully
- [ ] New feature or fix is documented in `README.md`
- [ ] Branch name is descriptive and follows the pattern
- [ ] Pull request includes a summary of changes
- [ ] All GitHub checks pass before merge

## Reporting Issues
Use the issue templates in `.github/ISSUE_TEMPLATE` to report bugs or request enhancements.

## Milestones
Refer to `MILESTONES.md` when planning new work or tracking upcoming releases.
