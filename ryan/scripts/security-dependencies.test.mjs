import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const frameworkRequire = createRequire(require.resolve('@vercel/frameworks'));
const typeidRequire = createRequire(require.resolve('typeid-js'));
const { typeid, TypeID, typeidUnboxed, toUUID, fromUUID } = require('typeid-js');
const uuid = typeidRequire('uuid');

test('framework YAML reader preserves nested settings and aliases', () => {
  const yaml = frameworkRequire('js-yaml');
  assert.deepEqual(yaml.safeLoad('defaults: &defaults\n  port: 4323\nsite:\n  <<: *defaults\n  name: Ryan\n'), {
    defaults: { port: 4323 }, site: { port: 4323, name: 'Ryan' },
  });
});

test('framework TOML reader preserves arrays, sections and booleans', () => {
  const toml = frameworkRequire('smol-toml');
  assert.deepEqual(toml.parse('name = "Ryan"\n[build]\npublish = "dist"\npreview = true\nroutes = ["/", "/travel"]'), {
    name: 'Ryan', build: { publish: 'dist', preview: true, routes: ['/', '/travel'] },
  });
});

test('patched UUID supports the exact buffer API used by TypeID', () => {
  const buffer = new Uint8Array(16);
  assert.equal(uuid.v7(undefined, buffer), buffer);
  assert.ok(uuid.validate(uuid.stringify(buffer)));
  assert.equal(uuid.version(uuid.stringify(buffer)), 7);
});

test('TypeID generation remains unique and round-trips boxed and unboxed IDs', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = typeid('photo');
    const raw = id.toString();
    assert.ok(uuid.validate(id.toUUID()));
    assert.equal(uuid.version(id.toUUID()), 7);
    assert.equal(TypeID.fromString(raw).toUUID(), id.toUUID());
    assert.equal(TypeID.fromUUID('photo', id.toUUID()).toString(), raw);
    ids.add(raw);
  }
  assert.equal(ids.size, 1000);
  const raw = typeidUnboxed('collection');
  assert.equal(fromUUID(toUUID(raw), 'collection'), raw);
});
