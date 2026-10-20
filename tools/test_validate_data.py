import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import validate_data  # noqa: E402


def write(root, rel, obj):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)


def base_data():
    return {
        'items.json': [{'id': 'tea', 'name': '茶', 'price': 190}],
        'npcs.json': [
            {'id': 'laohan', 'name': '老韩', 'giftable': True, 'favorite': 'tea'},
            {'id': 'tang', 'name': '唐经理', 'giftable': False},
        ],
        'backgrounds.json': [{'id': 'office', 'label': 'o'}],
        'rooms.json': [{'id': 'r1', 'label': 'R', 'bg': 'office', 'hotspots': [
            {'id': 'h1', 'label': 'H', 'rect': [10, 10, 20, 20], 'scene': 'b'}]}],
        'actions.json': [{'id': 'x', 'label': 'X', 'days': [2], 'room': 'r1', 'costHours': 1}],
        'events.json': [{'id': 'ev1', 'day': 1, 'hour': 9, 'scene': 'b'}],
        'evidence.json': [{'id': 'E01', 'name': 'e', 'desc': 'd'}],
        'testimony.json': [{'id': 'T26', 'name': 't', 'desc': 'd', 'slice': True}],
        'scenes/a.json': {
            'a': [
                {'type': 'say', 'speaker': 'limo', 'text': 'x'},
                {'type': 'effect', 'effects': [{'kind': 'evidence', 'id': 'E01'}]},
                {'type': 'branch', 'when': {'kind': 'intelClean', 'intel': 'phone'},
                 'then': [{'type': 'say', 'speaker': 'limo', 'text': 'slip', 'tag': 'T26'}],
                 'else': [{'type': 'say', 'speaker': 'limo', 'text': 'ok'}]},
                {'type': 'goto', 'scene': 'b'},
            ],
            'b': [{'type': 'end'}],
        },
        'exams/e.json': {
            'id': 'e', 'title': 'E', 'startPersuasion': 5, 'wrongReply': [], 'onClear': 'b',
            'statements': [{'id': 's1', 'text': 't', 'steps': [
                {'kind': 'present', 'id': 'p1', 'accepts': ['E01'], 'reply': []},
                {'kind': 'press', 'id': 'p2', 'after': ['p1'], 'reply': []},
            ]}],
        },
    }


class ValidateDataTest(unittest.TestCase):
    def run_with(self, mutate=None):
        data = base_data()
        if mutate:
            mutate(data)
        with tempfile.TemporaryDirectory() as root:
            for rel, obj in data.items():
                write(root, rel, obj)
            return validate_data.main(root)

    def test_valid_data_passes(self):
        self.assertEqual(self.run_with(), 0)

    def test_item_prices_must_sum_to_190(self):
        self.assertNotEqual(self.run_with(lambda d: d['items.json'][0].update(price=189)), 0)

    def test_npc_favorite_must_exist(self):
        self.assertNotEqual(self.run_with(lambda d: d['npcs.json'][0].update(favorite='ghost')), 0)

    def test_npc_minefield_must_exist(self):
        self.assertNotEqual(self.run_with(lambda d: d['npcs.json'][0].update(minefield=['ghost'])), 0)

    def test_ungiftable_npc_cannot_have_favorite(self):
        self.assertNotEqual(self.run_with(lambda d: d['npcs.json'][1].update(favorite='tea')), 0)

    def test_goto_target_must_exist(self):
        def m(d):
            d['scenes/a.json']['a'][3]['scene'] = 'nowhere'
        self.assertNotEqual(self.run_with(m), 0)

    def test_unknown_evidence_in_effect_fails(self):
        def m(d):
            d['scenes/a.json']['a'][1]['effects'][0]['id'] = 'E99'
        self.assertNotEqual(self.run_with(m), 0)

    def test_unknown_accepts_id_in_exam_fails(self):
        def m(d):
            d['exams/e.json']['statements'][0]['steps'][0]['accepts'] = ['E99']
        self.assertNotEqual(self.run_with(m), 0)

    def test_allowed_quote_tags_pass(self):
        def m(d):
            d['exams/e.json']['statements'][0]['steps'][0]['accepts'] = ['E01', 'G3', 'Q-light']
        self.assertEqual(self.run_with(m), 0)

    def test_after_must_reference_a_step_in_the_same_statement(self):
        def m(d):
            d['exams/e.json']['statements'][0]['steps'][1]['after'] = ['ghost']
        self.assertNotEqual(self.run_with(m), 0)

    def test_on_clear_scene_must_exist(self):
        self.assertNotEqual(self.run_with(lambda d: d['exams/e.json'].update(onClear='nowhere')), 0)

    def test_slice_slip_must_appear_in_a_branch_then(self):
        def m(d):
            d['scenes/a.json']['a'][2]['then'][0]['tag'] = 'G1'
        self.assertNotEqual(self.run_with(m), 0)

    def test_bg_node_must_name_a_known_background(self):
        def m(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'bg', 'id': 'office'})
        self.assertEqual(self.run_with(m), 0)

        def bad(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'bg', 'id': 'nowhere'})
        self.assertNotEqual(self.run_with(bad), 0)

    def test_room_hotspot_scene_must_exist(self):
        self.assertNotEqual(self.run_with(lambda d: d['rooms.json'][0]['hotspots'][0].update(scene='nowhere')), 0)

    def test_room_background_must_exist(self):
        self.assertNotEqual(self.run_with(lambda d: d['rooms.json'][0].update(bg='nowhere')), 0)

    def test_room_hotspot_rect_must_stay_inside_the_picture(self):
        self.assertNotEqual(self.run_with(lambda d: d['rooms.json'][0]['hotspots'][0].update(rect=[90, 10, 20, 20])), 0)

    def test_room_action_must_name_a_known_room(self):
        self.assertNotEqual(self.run_with(lambda d: d['actions.json'][0].update(room='ghost')), 0)

    def test_action_needs_a_scene_or_a_room(self):
        def m(d):
            del d['actions.json'][0]['room']
        self.assertNotEqual(self.run_with(m), 0)

    def test_event_scene_must_exist(self):
        self.assertNotEqual(self.run_with(lambda d: d['events.json'][0].update(scene='nowhere')), 0)

    def test_event_ids_must_be_unique(self):
        self.assertNotEqual(self.run_with(lambda d: d['events.json'].append(dict(d['events.json'][0]))), 0)

    def test_event_hour_must_be_a_real_hour(self):
        self.assertNotEqual(self.run_with(lambda d: d['events.json'][0].update(hour=25)), 0)


if __name__ == '__main__':
    unittest.main()
