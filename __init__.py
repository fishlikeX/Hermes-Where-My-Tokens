"""where-my-tokens — token analytics plugin core.

This plugin is pure observation: it contributes a dashboard REST surface
(dashboard/plugin_api.py) and a desktop page (desktop/plugin.js). It owns no
hooks and mutates nothing. register() must stay a no-op so the official
`hermes plugins validate` gate (minimal stub ctx) passes untouched.
"""


def register(ctx) -> None:  # noqa: ARG001 - nothing to register
    return None
