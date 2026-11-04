import json

import pytest

import app as server


@pytest.fixture
def client(tmp_path):
    return server.create_app(str(tmp_path / 'test.db')).test_client()


def sign_up(client, name='小明', password='abcd'):
    r = client.post('/api/register', json={'username': name, 'password': password})
    assert r.status_code == 200, r.get_json()
    return {'Authorization': 'Bearer ' + r.get_json()['token']}


def blob(**meta):
    return json.dumps({'version': 2, 'state': {'chapter': 'c1'}, 'meta': meta})


def test_register_then_login(client):
    sign_up(client)
    r = client.post('/api/login', json={'username': '小明', 'password': 'abcd'})
    assert r.status_code == 200
    assert r.get_json()['username'] == '小明'


def test_login_is_case_insensitive_and_returns_stored_name(client):
    sign_up(client, 'Alice')
    r = client.post('/api/login', json={'username': 'alice', 'password': 'abcd'})
    assert r.get_json()['username'] == 'Alice'


@pytest.mark.parametrize('name,password', [
    ('a', 'abcd'), ('x' * 21, 'abcd'), ('has space', 'abcd'), ('a@b', 'abcd'), ('ok_name', 'abc'), ('ok_name', 'x' * 65),
])
def test_register_rejects_bad_input(client, name, password):
    r = client.post('/api/register', json={'username': name, 'password': password})
    assert r.status_code == 400


def test_register_rejects_duplicate_name(client):
    sign_up(client, 'Alice')
    r = client.post('/api/register', json={'username': 'ALICE', 'password': 'other'})
    assert r.status_code == 409


def test_register_rejects_non_json_and_wrong_types(client):
    assert client.post('/api/register', data='nope').status_code == 400
    assert client.post('/api/register', json={'username': 1, 'password': 2}).status_code == 400


def test_wrong_password_and_unknown_user_look_the_same(client):
    sign_up(client)
    a = client.post('/api/login', json={'username': '小明', 'password': 'wrong'})
    b = client.post('/api/login', json={'username': '没这个人', 'password': 'wrong'})
    assert a.status_code == b.status_code == 401
    assert a.get_json() == b.get_json()


def test_account_locks_after_repeated_failures(client):
    sign_up(client)
    for _ in range(server.MAX_FAILS):
        assert client.post('/api/login', json={'username': '小明', 'password': 'wrong'}).status_code == 401
    locked = client.post('/api/login', json={'username': '小明', 'password': 'abcd'})
    assert locked.status_code == 429


def test_me_and_logout(client):
    auth = sign_up(client)
    assert client.get('/api/me', headers=auth).get_json() == {'username': '小明'}
    assert client.post('/api/logout', headers=auth).status_code == 200
    assert client.get('/api/me', headers=auth).status_code == 401


def test_saves_need_a_login(client):
    assert client.get('/api/saves').status_code == 401
    assert client.put('/api/saves/c1/1', json={'data': '{}', 'at': 1}).status_code == 401
    assert client.get('/api/saves', headers={'Authorization': 'Bearer forged'}).status_code == 401


def test_save_round_trip_and_overwrite(client):
    auth = sign_up(client)
    first, second = blob(at=1), blob(at=2)
    assert client.put('/api/saves/c1/3', json={'data': first, 'at': 1}, headers=auth).status_code == 200
    assert client.put('/api/saves/c1/3', json={'data': second, 'at': 2}, headers=auth).status_code == 200
    assert client.put('/api/saves/c1/auto', json={'data': first, 'at': 5}, headers=auth).status_code == 200
    saves = {(s['chapter'], s['slot']): s for s in client.get('/api/saves', headers=auth).get_json()['saves']}
    assert set(saves) == {('c1', '3'), ('c1', 'auto')}
    assert saves[('c1', '3')]['data'] == second and saves[('c1', '3')]['at'] == 2


def test_delete_save(client):
    auth = sign_up(client)
    client.put('/api/saves/c2/1', json={'data': blob(), 'at': 1}, headers=auth)
    assert client.delete('/api/saves/c2/1', headers=auth).status_code == 200
    assert client.get('/api/saves', headers=auth).get_json()['saves'] == []


def test_saves_are_private_to_each_account(client):
    alice, bob = sign_up(client, 'alice'), sign_up(client, 'bob')
    client.put('/api/saves/c1/1', json={'data': blob(), 'at': 1}, headers=alice)
    assert client.get('/api/saves', headers=bob).get_json()['saves'] == []
    client.delete('/api/saves/c1/1', headers=bob)
    assert len(client.get('/api/saves', headers=alice).get_json()['saves']) == 1


@pytest.mark.parametrize('path', ['/api/saves/c1/0', '/api/saves/c1/11', '/api/saves/c1/x', '/api/saves/C1/1', '/api/saves/1c/1'])
def test_put_rejects_bad_slot_or_chapter(client, path):
    auth = sign_up(client)
    assert client.put(path, json={'data': blob(), 'at': 1}, headers=auth).status_code == 400


@pytest.mark.parametrize('payload', [
    {'data': 'not json', 'at': 1}, {'data': blob(), 'at': 'x'}, {'data': blob(), 'at': True}, {'data': 5, 'at': 1}, {'at': 1},
])
def test_put_rejects_bad_payload(client, payload):
    auth = sign_up(client)
    assert client.put('/api/saves/c1/1', json=payload, headers=auth).status_code == 400


def test_put_rejects_oversized_save(client):
    auth = sign_up(client)
    big = json.dumps({'pad': 'x' * (server.MAX_SAVE_BYTES + 1)})
    assert client.put('/api/saves/c1/1', json={'data': big, 'at': 1}, headers=auth).status_code == 413


# ---- 章节进度 ----

def prof(cleared=None, seen=(), note=False):
    return {'cleared': cleared or {}, 'seenRecap': {c: True for c in seen}, 'seenChapterNote': note}


def test_profile_needs_a_login(client):
    assert client.put('/api/profile', json={'profile': prof()}).status_code == 401


def test_profile_first_upload_comes_back_as_is(client):
    auth = sign_up(client)
    mine = prof({'c1': {'ending': 'true', 'at': 5}}, seen=['c2'], note=True)
    r = client.put('/api/profile', json={'profile': mine}, headers=auth)
    assert r.get_json()['profile'] == mine


def test_profile_from_two_devices_is_merged(client):
    auth = sign_up(client)
    client.put('/api/profile', json={'profile': prof({'c1': {'ending': 'true', 'at': 5}})}, headers=auth)
    r = client.put('/api/profile', json={'profile': prof(seen=['c2'], note=True)}, headers=auth)
    merged = r.get_json()['profile']
    assert merged['cleared']['c1']['ending'] == 'true'
    assert merged['seenRecap'] == {'c2': True} and merged['seenChapterNote'] is True


def test_profile_keeps_the_later_clear_of_a_chapter(client):
    auth = sign_up(client)
    client.put('/api/profile', json={'profile': prof({'c1': {'ending': 'true', 'at': 50}})}, headers=auth)
    r = client.put('/api/profile', json={'profile': prof({'c1': {'ending': 'bad2', 'at': 10}})}, headers=auth)
    assert r.get_json()['profile']['cleared']['c1'] == {'ending': 'true', 'at': 50}
    r = client.put('/api/profile', json={'profile': prof({'c1': {'ending': 'bad2', 'at': 90}})}, headers=auth)
    assert r.get_json()['profile']['cleared']['c1']['ending'] == 'bad2'


def test_profile_is_private_to_each_account(client):
    alice, bob = sign_up(client, 'alice'), sign_up(client, 'bob')
    client.put('/api/profile', json={'profile': prof({'c1': {'ending': 'true', 'at': 5}})}, headers=alice)
    assert client.put('/api/profile', json={'profile': prof()}, headers=bob).get_json()['profile']['cleared'] == {}


def test_profile_drops_malformed_parts_and_rejects_non_profiles(client):
    auth = sign_up(client)
    junk = {'cleared': {'c1': {'ending': 'true', 'at': 'x'}, 'C!': {'ending': 'true', 'at': 1}, 'c2': {'ending': 'ok', 'at': 3}},
            'seenRecap': {'c2': 'yes', 'c3': True}, 'seenChapterNote': 'true'}
    r = client.put('/api/profile', json={'profile': junk}, headers=auth)
    assert r.get_json()['profile'] == prof({'c2': {'ending': 'ok', 'at': 3}}, seen=['c3'])
    for bad in (None, [], 'x', 5):
        assert client.put('/api/profile', json={'profile': bad}, headers=auth).status_code == 400
