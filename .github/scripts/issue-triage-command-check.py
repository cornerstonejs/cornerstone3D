"""Permit direct read queries used by the issue-triage prompt."""

import json
import re
import shlex
import sys


GIT_FLAGS = {
    "log": """
        --oneline --all --reverse --merges --no-merges --first-parent --follow
        --date-order --topo-order --full-history --no-decorate --decorate
        --name-only --name-status --stat --numstat --shortstat --summary --raw
        -p --patch --no-patch --no-color --no-ext-diff --no-textconv --no-renames
    """,
    "show": """
        --oneline --name-only --name-status --stat --numstat --shortstat
        --summary --raw -p --patch --no-patch --no-color --no-ext-diff
        --no-textconv --no-renames
    """,
    "diff": """
        --name-only --name-status --stat --numstat --shortstat --summary --raw
        -p --patch --no-patch --no-color --no-ext-diff --no-textconv --no-renames
        --cached --staged --check --exit-code --quiet --ignore-space-change
        --ignore-all-space --ignore-blank-lines -b -w
    """,
    "blame": """
        --line-porcelain --porcelain --incremental --show-email --show-name
        --root --reverse --no-textconv -w -e -l -s -n
    """,
    "tag": "--list -l --ignore-case -i --column --no-column",
    "describe": "--all --tags --contains --long --always --exact-match --debug",
}
GIT_VALUES = {
    "log": """
        --format --pretty --max-count -n --skip --since --until --after --before
        --author --committer --grep --date --diff-filter --find-object -S -G -L
    """,
    "show": "--format --pretty --date --diff-filter",
    "diff": "--diff-filter --word-diff --word-diff-regex --unified -U -S -G",
    "blame": "-L --since --date",
    "tag": "--contains --no-contains --merged --no-merged --points-at --sort --format",
    "describe": "--abbrev --candidates --match --exclude",
}
GH_FLAGS = {
    ("issue", "view"): "--comments -c",
    ("issue", "list"): "",
    ("search", "issues"): "--include-prs",
    ("search", "prs"): "--draft --merged",
    ("pr", "view"): "--comments -c",
    ("pr", "list"): "--draft -d",
    ("pr", "diff"): "--patch --name-only",
    ("release", "list"): "--exclude-drafts --exclude-pre-releases",
    ("release", "view"): "",
}
GH_VALUES = """
    --repo -R --json --jq --limit -L --state -s --author -A
    --assignee -a --label -l --search -S --base -B --head -H --sort --order
    --created --updated --closed --merged-at --owner --match --mentions
    --involves --commenter --milestone --visibility --archived --language
    --number --comments --color
"""


def literal_arguments(command):
    """Reject shell execution syntax before parsing quoted arguments."""
    if not isinstance(command, str):
        raise ValueError("Use a command string.")
    quote = None
    escaped = False
    for character in command:
        if escaped:
            if character == "\n":
                raise ValueError("Use one command on one line.")
            escaped = False
            continue
        if quote == "'":
            if character == "'":
                quote = None
            continue
        if character == "\\":
            escaped = True
        elif character in "`$":
            raise ValueError("Use literal arguments without shell variables.")
        elif quote == '"':
            if character == '"':
                quote = None
        elif character in "'\"":
            quote = character
        elif character in ";&|<>(){}*?[]~\n\r#":
            raise ValueError("Use one direct command without shell operators.")
    return shlex.split(command)


def check_options(arguments, flags, value_flags, numeric_count=False):
    """Permit complete option names from the command's fixed list."""
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        if argument == "--":
            return
        if not argument.startswith("-"):
            index += 1
            continue
        if numeric_count and re.fullmatch(r"-\d+", argument):
            index += 1
            continue
        option, separator, value = argument.partition("=")
        if option in flags and not separator:
            index += 1
            continue
        if option not in value_flags:
            # Permit attached values such as -n20 and -L10,30.
            if (
                argument[:2] in value_flags
                and not argument.startswith("--")
                and len(argument) > 2
            ):
                index += 1
                continue
            raise ValueError(f"Option {option} is not permitted for this query.")
        if not separator:
            index += 1
            if index >= len(arguments):
                raise ValueError(f"Option {option} requires a value.")
            value = arguments[index]
        if not value or value.startswith("-"):
            raise ValueError(f"Use a literal value for {option}.")
        if option == "--jq" and re.search(r"\benv\b|\$ENV\b", value):
            raise ValueError("Do not read environment variables through jq.")
        index += 1


def checked_command(command):
    """Validate a query and disable Git external diff programs."""
    arguments = literal_arguments(command)
    if len(arguments) < 2:
        raise ValueError("Use a direct gh or git read query.")
    if arguments[0] == "git" and arguments[1] in GIT_FLAGS:
        subcommand = arguments[1]
        options = arguments[2:]
        if subcommand == "tag" and options:
            list_modes = {
                "--list", "-l", "--contains", "--no-contains",
                "--merged", "--no-merged", "--points-at",
            }
            if not any(option.partition("=")[0] in list_modes for option in options):
                raise ValueError("Use git tag --list or git tag --contains.")
        check_options(
            options,
            set(GIT_FLAGS[subcommand].split()),
            set(GIT_VALUES[subcommand].split()),
            subcommand == "log",
        )
        if subcommand in {"log", "show", "diff"}:
            arguments[2:2] = ["--no-ext-diff", "--no-textconv"]
        elif subcommand == "blame":
            arguments.insert(2, "--no-textconv")
    elif arguments[0] == "gh" and tuple(arguments[1:3]) in GH_FLAGS:
        subcommand = tuple(arguments[1:3])
        check_options(
            arguments[3:],
            set(GH_FLAGS[subcommand].split()),
            set(GH_VALUES.split()),
        )
    else:
        raise ValueError(
            "Use a gh or git command listed in the triage prompt. "
            "Use Read, Grep, or Glob for files."
        )
    return shlex.join(arguments)


def main():
    """Return the hook decision without executing the requested command."""
    try:
        request = json.load(sys.stdin)
        tool_input = request["tool_input"]
        command = checked_command(tool_input["command"])
        response = {
            "hookEventName": "PreToolUse",
            "updatedInput": {**tool_input, "command": command},
        }
    except Exception as error:
        response = {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": str(error),
        }
    print(json.dumps({"hookSpecificOutput": response}))


if __name__ == "__main__":
    main()
