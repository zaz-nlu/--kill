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
        'deductions.json': [{'id': 'n1', 'prompt': 'p', 'pick': 2, 'answer': ['E01', 'T26'], 'hints': ['h']}],
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

    def test_action_attack_scene_must_exist(self):
        self.assertNotEqual(self.run_with(lambda d: d['actions.json'][0].update(attack='nowhere')), 0)
        self.assertEqual(self.run_with(lambda d: d['actions.json'][0].update(attack='b', risk='high')), 0)

    def test_action_risk_must_be_known(self):
        self.assertNotEqual(self.run_with(lambda d: d['actions.json'][0].update(risk='deadly')), 0)

    def test_show_node_must_name_a_known_item(self):
        def ok(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'show', 'id': 'E01'})
        self.assertEqual(self.run_with(ok), 0)

        def bad(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'show', 'id': 'E99'})
        self.assertNotEqual(self.run_with(bad), 0)

    def test_deduce_node_must_name_a_known_deduction(self):
        def ok(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'deduce', 'id': 'n1'})
        self.assertEqual(self.run_with(ok), 0)

        def bad(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'deduce', 'id': 'nope'})
        self.assertNotEqual(self.run_with(bad), 0)

    def test_frames_node_must_name_a_known_frame_check(self):
        def ok(d):
            d['frames.json'] = [{'id': 'f1', 'prompt': 'p', 'rows': [
                {'id': 'a', 'time': '20:45', 'text': 't', 'flaw': True}]}]
            d['scenes/a.json']['a'].insert(0, {'type': 'frames', 'id': 'f1'})
        self.assertEqual(self.run_with(ok), 0)

        def bad(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'frames', 'id': 'nope'})
        self.assertNotEqual(self.run_with(bad), 0)

    def test_frame_check_rows_need_unique_ids_and_a_real_flaw(self):
        def dup(d):
            d['frames.json'] = [{'id': 'f1', 'prompt': 'p', 'rows': [
                {'id': 'a', 'time': 't', 'text': 'x', 'flaw': True},
                {'id': 'a', 'time': 't', 'text': 'y', 'flaw': False}]}]
        self.assertNotEqual(self.run_with(dup), 0)

        def none(d):
            d['frames.json'] = [{'id': 'f1', 'prompt': 'p', 'rows': [
                {'id': 'a', 'time': 't', 'text': 'x', 'flaw': False}]}]
        self.assertNotEqual(self.run_with(none), 0)

    def test_exam_node_must_name_a_known_exam(self):
        def ok(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'exam', 'id': 'e'})
        self.assertEqual(self.run_with(ok), 0)

        def bad(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'exam', 'id': 'nope'})
        self.assertNotEqual(self.run_with(bad), 0)

    def test_statement_any_of_must_name_its_own_steps(self):
        def bad(d):
            d['exams/e.json']['statements'][0]['anyOf'] = ['p1', 'zzz']
        self.assertNotEqual(self.run_with(bad), 0)

        def ok(d):
            d['exams/e.json']['statements'][0]['anyOf'] = ['p1']
        self.assertEqual(self.run_with(ok), 0)

    def test_ending_flags_must_be_known_endings(self):
        def bad(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'effect', 'effects': [{'kind': 'flag', 'key': 'ending:nope', 'value': True}]})
        self.assertNotEqual(self.run_with(bad), 0)

        def ok(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'effect', 'effects': [{'kind': 'flag', 'key': 'ending:true', 'value': True}]})
        self.assertEqual(self.run_with(ok), 0)

    def test_deduction_must_name_real_items(self):
        self.assertNotEqual(self.run_with(lambda d: d['deductions.json'][0].update(answer=['E01', 'E99'])), 0)

    def test_deduction_answer_must_fit_the_slots(self):
        self.assertNotEqual(self.run_with(lambda d: d['deductions.json'][0].update(pick=1)), 0)

    def test_deduction_trap_items_must_exist(self):
        def m(d):
            d['deductions.json'][0]['trap'] = {'items': ['E01', 'E99'], 'flag': 'x', 'line': 'l'}
        self.assertNotEqual(self.run_with(m), 0)

    def test_any_condition_is_checked_inside(self):
        def bad(d):
            d['scenes/a.json']['a'].insert(0, {'type': 'branch', 'when': {'kind': 'any', 'conds': [{'kind': 'hasEvidence', 'id': 'E99'}]}, 'then': [], 'else': []})
        self.assertNotEqual(self.run_with(bad), 0)

    def test_action_requires_must_name_known_items(self):
        self.assertNotEqual(self.run_with(lambda d: d['actions.json'][0].update(requires={'kind': 'hasEvidence', 'id': 'E99'})), 0)
        self.assertEqual(self.run_with(lambda d: d['actions.json'][0].update(requires={'kind': 'hasEvidence', 'id': 'E01'})), 0)

    def test_event_requires_must_name_known_items(self):
        self.assertNotEqual(self.run_with(lambda d: d['events.json'][0].update(requires={'kind': 'hasTestimony', 'id': 'T99'})), 0)


if __name__ == '__main__':
    unittest.main()
