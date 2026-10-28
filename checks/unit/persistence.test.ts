import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { applyBaseSchema } from '../../src/services/persistence/schema';
import { QueueRows } from '../../src/services/persistence/QueueRows';
import { runMigrationSteps } from '../../src/services/persistence/migrations';
import type { QueueDatabaseWriteRow } from '../../src/types/queue';

function row(): QueueDatabaseWriteRow {
  return {
    id: 'fixture',
    slug: 'serie',
    download_slug: null,
    anime_title: 'Serie sintética',
    poster: null,
    preferred_server: null,
    episodes: '[1,1.5]',
    lang: 'DUB',
    status: 'paused',
    current_ep: 1.5,
    provider_id: 'animeav1',
    progress: 0,
    completed_eps: '[1]',
    failed_eps: '[1.5]',
    paused_eps: '[1.5]',
    cancelled_eps: '[]',
    target_path: 'fixture/serie-dub',
    output_dir_index: 0,
    current_server: null,
  };
}

test('SQLite conserva proveedor, idioma y episodios decimales en el destino original', () => {
  const db = new Database(':memory:');
  try {
    applyBaseSchema(db);
    const rows = new QueueRows(db);
    rows.saveQueueItems([row()]);
    const saved = rows.getAllQueueItems()[0];
    assert.equal(saved.provider_id, 'animeav1');
    assert.equal(saved.lang, 'DUB');
    assert.deepEqual(JSON.parse(saved.episodes), [1, 1.5]);
    assert.deepEqual(JSON.parse(saved.failed_eps), [1.5]);
    assert.equal(saved.target_path, row().target_path);
    assert.equal(saved.current_ep, 1.5);
  } finally {
    db.close();
  }
});

test('una escritura de cola fallida revierte el reemplazo y conserva los datos previos', () => {
  const db = new Database(':memory:');
  try {
    applyBaseSchema(db);
    const rows = new QueueRows(db);
    rows.saveQueueItems([row()]);
    assert.throws(() => rows.saveQueueItems([row(), row()]));
    assert.equal(rows.getAllQueueItems().length, 1);
    assert.equal(rows.getAllQueueItems()[0].lang, 'DUB');
  } finally {
    db.close();
  }
});

test('un paso de migración fallido no deja modificaciones parciales', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE fixture (value INTEGER); INSERT INTO fixture VALUES (1)');
    assert.throws(() =>
      runMigrationSteps(
        db,
        [
          {
            version: 1,
            run(connection) {
              connection.exec('UPDATE fixture SET value = 2');
              throw new Error('Fallo sintético');
            },
          },
        ],
        0,
        1,
      ),
    );
    assert.deepEqual(db.prepare('SELECT value FROM fixture').get(), { value: 1 });
  } finally {
    db.close();
  }
});
