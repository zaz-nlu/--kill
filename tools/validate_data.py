"""Validate the cross-references inside game/src/data.

Usage: py -3 tools/validate_data.py src/data
Exit code 0 when everything is consistent, 1 otherwise.
"""
import glob
import json
import os
import re
import sys

ITEM_TOTAL = 190  # spec 6.2b: giving everyone their favourite costs 190
QUOTE_TAG = re.compile(r'^(G[1-9]|Q-.+)$')


def load(root, rel, default):
    path = os.path.join(root, rel)
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_dir(root, rel):
    out = []
    for path in sorted(glob.glob(os.path.join(root, rel, '*.json'))):
        with open(path, encoding='utf-8') as f:
            out.append(json.load(f))
    return out


def walk_nodes(nodes, in_then=False):
    """Yield (node, in_then) for every node, descending into branches."""
    for n in nodes:
        yield n, in_then
        if n.get('type') == 'branch':
            yield from walk_nodes(n.get('then', []), True)
            yield from walk_nodes(n.get('else', []), in_then)


def walk_condition(c):
    yield c
    if c.get('kind') == 'not':
        yield from walk_condition(c['cond'])


def main(root):
    errors = []

    items = load(root, 'items.json', [])
    npcs = load(root, 'npcs.json', [])
    evidence = {e['id'] for e in load(root, 'evidence.json', [])}
    backgrounds = {b['id'] for b in load(root, 'backgrounds.json', [])}
    testimony_list = load(root, 'testimony.json', [])
    testimony = {t['id'] for t in testimony_list}
    scenes = {}
    for chunk in load_dir(root, 'scenes'):
        scenes.update(chunk)
    exams = load_dir(root, 'exams')

    def known_ref(i):
        return i in evidence or i in testimony or bool(QUOTE_TAG.match(i))

    # 1. item prices
    if items:
        total = sum(i['price'] for i in items)
        if total != ITEM_TOTAL:
            errors.append(f'items: prices sum to {total}, expected {ITEM_TOTAL}')

    # 2. npc gift preferences
    item_ids = {i['id'] for i in items}
    for n in npcs:
        fav = n.get('favorite')
        if fav is not None and fav not in item_ids:
            errors.append(f"npc {n['id']}: favorite '{fav}' is not an item")
        if fav is not None and not n.get('giftable', True):
            errors.append(f"npc {n['id']}: not giftable but has a favorite")
        for m in n.get('minefield', []):
            if m not in item_ids:
                errors.append(f"npc {n['id']}: minefield '{m}' is not an item")

    # 3/4. scenes
    branch_then_tags = set()
    for sid, nodes in scenes.items():
        for node, in_then in walk_nodes(nodes):
            t = node.get('type')
            if t == 'say' and node.get('tag'):
                tag = node['tag']
                if not known_ref(tag):
                    errors.append(f"scene {sid}: unknown tag '{tag}'")
                if in_then:
                    branch_then_tags.add(tag)
            effect_lists = []
            if t == 'effect':
                effect_lists.append(node.get('effects', []))
            if t == 'choice':
                for opt in node['options']:
                    effect_lists.append(opt.get('effects', []))
                    if opt.get('goto') and opt['goto'] not in scenes:
                        errors.append(f"scene {sid}: choice goto '{opt['goto']}' does not exist")
            for effects in effect_lists:
                for e in effects:
                    if e['kind'] == 'evidence' and e['id'] not in evidence:
                        errors.append(f"scene {sid}: unknown evidence '{e['id']}'")
                    if e['kind'] == 'testimony' and e['id'] not in testimony:
                        errors.append(f"scene {sid}: unknown testimony '{e['id']}'")
            if t == 'bg' and node['id'] not in backgrounds:
                errors.append(f"scene {sid}: unknown background '{node['id']}'")
            if t == 'goto' and node['scene'] not in scenes:
                errors.append(f"scene {sid}: goto '{node['scene']}' does not exist")
            if t == 'branch':
                for c in walk_condition(node['when']):
                    if c['kind'] == 'hasEvidence' and c['id'] not in evidence:
                        errors.append(f"scene {sid}: condition on unknown evidence '{c['id']}'")
                    if c['kind'] == 'hasTestimony' and c['id'] not in testimony:
                        errors.append(f"scene {sid}: condition on unknown testimony '{c['id']}'")

    # rooms and actions
    rooms = load(root, 'rooms.json', [])
    room_ids = {r['id'] for r in rooms}
    for r in rooms:
        if r['bg'] not in backgrounds:
            errors.append(f"room {r['id']}: unknown background '{r['bg']}'")
        for h in r.get('hotspots', []):
            if h['scene'] not in scenes:
                errors.append(f"room {r['id']}/{h['id']}: scene '{h['scene']}' does not exist")
            x, y, w, ht = h['rect']
            if not (x >= 0 and y >= 0 and w > 0 and ht > 0 and x + w <= 100 and y + ht <= 100):
                errors.append(f"room {r['id']}/{h['id']}: rect {h['rect']} is outside the picture")
    for act in load(root, 'actions.json', []):
        if act.get('room'):
            if act['room'] not in room_ids:
                errors.append(f"action {act['id']}: room '{act['room']}' does not exist")
        elif act.get('scene') not in scenes:
            errors.append(f"action {act['id']}: needs a scene or a room")

    # exams
    for ex in exams:
        if ex.get('onClear') and ex['onClear'] not in scenes:
            errors.append(f"exam {ex['id']}: onClear '{ex['onClear']}' does not exist")
        for st in ex.get('statements', []):
            step_ids = {s['id'] for s in st['steps']}
            for s in st['steps']:
                for a in s.get('after', []):
                    if a not in step_ids:
                        errors.append(f"exam {ex['id']}/{st['id']}: step '{s['id']}' after unknown step '{a}'")
                for acc in s.get('accepts', []):
                    if not known_ref(acc):
                        errors.append(f"exam {ex['id']}/{st['id']}: unknown accepts id '{acc}'")

    # 6. slice slips must be reachable through a branch.then
    for t in testimony_list:
        if t.get('slice') and t['id'] not in branch_then_tags:
            errors.append(f"testimony {t['id']}: marked slice but never used as a tag inside a branch.then")

    for e in errors:
        print('ERROR:', e)
    if not errors:
        print('OK')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'src/data'))
