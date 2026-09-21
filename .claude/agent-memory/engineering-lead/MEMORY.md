# Engineering Lead Memory

- [Non-destructive test data](feedback_non_destructive_test_data.md) — never reset the dev DB in tests; tag, scope assertions, clean up only what the run created.
- [Phase approval workflow](project_phase_approval_workflow.md) — owner approves phase plans decision-by-decision (D1, D2...) before implementation starts.
- [Subagent worktree isolation](feedback_subagent_worktree_isolation.md) — don't assign a subagent a worktree; adopt the one it creates, and prep deps/.env.
- [Shared dev DB contention](feedback_shared_dev_db_contention.md) — only one agent may run the backend e2e suite at a time; some assertions aren't hermetic.
