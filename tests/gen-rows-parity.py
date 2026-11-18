#!/usr/bin/env python3
"""Writes experiments/statusline-band/hooks/rows.parity.ts: the rows
subagent-statusline.sh draws for the scenarios of tests/run.sh, with the raw
inputs it read (settings, definitions, the environment, the mod's facts), so
the mod's port (hooks/rows.ts) is held to the script byte for byte.

Run it after a change to subagent-statusline.sh, then `claude plugin test` in
experiments/statusline-band: python3 tests/gen-rows-parity.py
tests/run.sh writes it to a temporary path (the first argument) and fails when
it differs from the committed file.
"""
import sys
import copy
import json
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'tests', 'fixtures')
SCRIPT = os.path.join(ROOT, 'subagent-statusline.sh')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'experiments', 'statusline-band', 'hooks', 'rows.parity.ts')
NOW = 1790000000
SID = '0f3c9a2e-5b7d-4e1a-9c2f-7a8b6d5e4f31'
PATH = '/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin'

base = json.load(open(os.path.join(FIX, 'subagents.json'), encoding='utf-8'))
settings_fix = json.load(open(os.path.join(FIX, 'settings.json'), encoding='utf-8'))


def run(payload, settings=None, defs=(), env=None, facts=None):
    """defs: (where, file name, text), where is 'user' or 'project'."""
    with tempfile.TemporaryDirectory() as t:
        home = os.path.join(t, 'home')
        work = os.path.join(t, 'work')
        os.makedirs(os.path.join(home, '.claude', 'agents'))
        os.makedirs(os.path.join(work, '.claude', 'agents'))
        if settings is not None:
            with open(os.path.join(home, '.claude', 'settings.json'), 'w', encoding='utf-8') as f:
                f.write(settings if isinstance(settings, str) else json.dumps(settings, ensure_ascii=False))
        for where, name, text in defs:
            d = os.path.join(home if where == 'user' else work, '.claude', 'agents')
            with open(os.path.join(d, name), 'w', encoding='utf-8') as f:
                f.write(text)
        if facts is not None:
            with open(os.path.join(t, f'pace-band-agents-{SID}.json'), 'w', encoding='utf-8') as f:
                f.write(facts)
        p = copy.deepcopy(payload)
        p['cwd'] = work
        p['session_id'] = SID
        e = {'HOME': home, 'PATH': PATH, 'TMPDIR': t, 'STATUSLINE_NOW': str(NOW),
             'STATUSLINE_CONFIG': os.path.join(t, 'none.sh')}
        e.update(env or {})
        r = subprocess.run(['/bin/bash', SCRIPT], input=json.dumps(p, ensure_ascii=False).encode(),
                           capture_output=True, env=e, cwd=work, check=True)
        return [json.loads(l) for l in r.stdout.decode().splitlines() if l.strip()]


def scenario(name, payload, settings=None, defs=(), env=None, facts=None):
    rows = run(payload, settings, defs, env, facts)
    s = settings
    if isinstance(s, str):
        try:
            s = json.loads(s)
        except ValueError:
            s = None
    return {'name': name, 'columns': payload.get('columns', 0), 'tasks': payload['tasks'],
            'settings': s, 'defs': [list(d) for d in defs], 'env': env or {},
            'facts': facts, 'rows': rows}


def with_tasks(extra=None, keep=None, columns=None):
    p = copy.deepcopy(base)
    if keep is not None:
        p['tasks'] = [t for t in p['tasks'] if t['id'] in keep]
    if extra:
        p['tasks'] += extra
    if columns is not None:
        p['columns'] = columns
    return p


S = []
S.append(scenario('subagents', base, settings_fix))
S.append(scenario('narrow', with_tasks(columns=58), settings_fix, env={'STATUSLINE_SHOW_EFFORT_CHECK': '0'}))
S.append(scenario('no-settings', base))
S.append(scenario('ru', base, dict(settings_fix, language='Russian')))
S.append(scenario('lang-pinned-en', base, dict(settings_fix, language='Russian'), env={'STATUSLINE_LANG': 'en'}))
S.append(scenario('kit-ru', base, {'effortLevel': 'xhigh', 'language': 'English',
                                   'pluginConfigs': {'pace-band@tsalkin': {'options': {'language': 'ru'}}}}))

profile_defs = [
    ('user', 'ispolnitel.md', '---\nname: ispolnitel\ndescription: x\nmodel: opus\neffort: high\n---\nbody\n'),
    ('user', 'mekhanik.md', '---\ndescription: y\nmodel: "sonnet"\neffort: low\n---\n'),
    ('user', 'research.md', '---\nname: research\nmodel: opus\n---\n'),
    ('project', 'research.md', '---\nname: research\nmodel: haiku\n---\n'),
]
a8 = {'id': 'a8', 'type': 'local_agent', 'agentType': 'ispolnitel', 'status': 'running',
      'description': 'Build the fleet section', 'startTime': 1789999900000, 'model': 'claude-sonnet-5-5',
      'effort': 'high', 'contextWindowSize': 200000, 'tokenCount': 9000}
S.append(scenario('profile', with_tasks([a8]), settings_fix, profile_defs))
S.append(scenario('profile-checks-off', with_tasks([a8]), settings_fix, profile_defs,
                  env={'STATUSLINE_SHOW_MODEL_CHECK': '0', 'STATUSLINE_SHOW_EFFORT_CHECK': '0'}))

S.append(scenario('facts', base, settings_fix,
                  facts='{"a1":{"model":"claude-opus-5-5","effort":"medium"},"a2":"junk","a3":{"model":"claude-haiku-4-5"},"a6":{"model":"claude-opus-5-5[1m]","effort":"max"}}'))

mek = [('user', 'mekhanik.md', '---\nname: mekhanik\neffort: high\n---\n')]
two = with_tasks(keep={'a2', 'a5'})
for v in ['medium', 'max', ' HIGH ', 'med', 'inherit', 'nonsense', '']:
    S.append(scenario(f'agent-default env [{v}]', two, settings_fix, mek, env={'CLAUDE_CODE_SUBAGENT_EFFORT': v}))
S.append(scenario('agent-default settings [high]', two,
                  dict(settings_fix, env={'CLAUDE_CODE_SUBAGENT_EFFORT': 'high'}), mek))
S.append(scenario('agent-default settings [high] env [medium]', two,
                  dict(settings_fix, env={'CLAUDE_CODE_SUBAGENT_EFFORT': 'high'}), mek,
                  env={'CLAUDE_CODE_SUBAGENT_EFFORT': 'medium'}))
S.append(scenario('agent-default settings env broken', two, dict(settings_fix, env='not an object'), mek))


def row(name, model, effort):
    return {'id': 'm', 'type': 'local_agent', 'status': 'running', 'name': name, 'model': model,
            'effort': effort, 'contextWindowSize': 200000, 'tokenCount': 1000}


levels = dict(settings_fix, effortLevel='high', modelSettings={
    'claude-sonnet-5-5': {'effortLevel': 'high'}, 'Claude-Opus-5-5[1m]': {'effortLevel': 'xhigh'},
    'claude-haiku-5-5': {'effortLevel': 'turbo'}, 'claude-fable-5-1': 'not an object'})
isp = [('user', 'ispolnitel.md', '---\nname: ispolnitel\neffort: high\n---\n')]
for i, (n, m, e) in enumerate([
        ('general-purpose', 'claude-sonnet-5-5', 'medium'), ('general-purpose', 'claude-sonnet-5-5-20261001', 'high'),
        ('general-purpose', 'claude-opus-5-5[1m]', 'high'), ('general-purpose', 'claude-haiku-5-5', 'low'),
        ('general-purpose', 'claude-fable-5-1', 'medium'), ('general-purpose', 'claude-opus-4-8', 'medium'),
        ('general-purpose', 'claude-mystery-9', 'low'), ('ispolnitel', 'claude-sonnet-5-5', 'medium')]):
    p = {'columns': 200, 'tasks': [row(n, m, e)]}
    S.append(scenario(f'model-level {i}', p, levels, isp))
    S.append(scenario(f'model-level {i} env [low]', p, levels, isp, env={'CLAUDE_CODE_SUBAGENT_EFFORT': 'low'}))
S.append(scenario('model-level broken', {'columns': 200, 'tasks': [row('general-purpose', 'claude-sonnet-5-5', 'medium')]},
                  dict(levels, modelSettings='broken'), isp))

# Lengths, names and the cut of the task text.
long = {'id': 'l', 'type': 'local_agent', 'status': 'killed', 'description': '  ' + 'x' * 50,
        'model': 'claude-opus-5-5', 'effort': 'max', 'contextWindowSize': 100000, 'tokenCount': 95000,
        'tokenSamples': [5, 5, 5], 'startTime': NOW - 7300, 'label': 'одна\u0007строка\tс управляющими'}
S.append(scenario('lengths', {'columns': 90, 'tasks': [long]}, settings_fix,
                  env={'STATUSLINE_SUBAGENT_BAR_LEN': '6', 'STATUSLINE_SUBAGENT_SPARK_LEN': '0',
                       'STATUSLINE_SUBAGENT_NAME_MAX': '10', 'STATUSLINE_CTX_WARN': '90', 'STATUSLINE_CTX_CRIT': '99'}))
S.append(scenario('no-columns', {'tasks': [dict(long, status='failed', label='short')]}, settings_fix))

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('// Generated by tests/gen-rows-parity.py from subagent-statusline.sh: do not edit.\n')
    f.write(f'export const PARITY_NOW = {NOW}\n')
    f.write('export const PARITY = ')
    f.write(json.dumps(S, ensure_ascii=False, indent=1))
    f.write(' as const\n')
print(f'{len(S)} scenarios, {sum(len(s["rows"]) for s in S)} rows → {OUT}')
