import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authDatabase } from './helpers/auth-database.js';
import { importTypingContent } from '../src/lib/typing-import.js';

const connection = process.env.TEST_DATABASE_URL;
function draft() {
  return {
    exam: { slug: 'example', name: 'Illustrative exam', organization: null },
    version: {
      versionKey: 'draft-1',
      label: 'Illustrative',
      language: 'en',
      examYear: null,
      durationSeconds: null,
      backspacePolicy: null,
      editingPolicy: null,
      scoringMethod: null,
      targetWpm: null,
      maxErrorPercent: null,
      targetKeystrokes: null,
      instructions: null,
      ruleSourceUrl: null,
      ruleSourceNote: null,
    },
    passages: [
      {
        contentKey: 'one',
        revision: 1,
        title: 'One',
        text: 'Exact <text>\r\n\t😀 e\u0301  ',
        examYear: null,
        shift: null,
        sourceKind: 'PRACTICE',
        sourceUrl: null,
        sourceNote: null,
      },
    ],
  };
}

test(
  'read-back failure after actual inserts rolls back the entire file',
  { skip: !connection },
  async (t) => {
    assert.ok(connection);
    const { database, client } = await authDatabase(t, connection);
    await client.query(`CREATE FUNCTION corrupt_typing_fixture() RETURNS trigger AS $$
      BEGIN NEW.title := 'Unexpected storage mutation'; RETURN NEW; END;
      $$ LANGUAGE plpgsql`);
    await client.query(`CREATE TRIGGER typing_fixture BEFORE INSERT ON "TypingPassage"
      FOR EACH ROW EXECUTE FUNCTION corrupt_typing_fixture()`);
    await assert.rejects(
      importTypingContent(draft(), database, { apply: true }),
    );
    assert.equal(await database.typingExam.count(), 0);
    assert.equal(await database.typingExamVersion.count(), 0);
    assert.equal(await database.typingPassage.count(), 0);
  },
);

test(
  'competing different content at one identity cannot overwrite the committed winner',
  { skip: !connection },
  async (t) => {
    assert.ok(connection);
    const { database } = await authDatabase(t, connection);
    const first = draft();
    const second = draft();
    second.passages[0].text = 'Different passage';
    const results = await Promise.allSettled([
      importTypingContent(first, database, { apply: true }),
      importTypingContent(second, database, { apply: true }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.equal(await database.typingExam.count(), 1);
    const stored = await database.typingPassage.findMany();
    assert.equal(stored.length, 1);
    assert.ok(
      ['Exact <text>\n\t😀 e\u0301  ', 'Different passage'].includes(
        stored[0].text,
      ),
    );
    const winner = stored[0].text;
    await assert.rejects(
      importTypingContent(
        winner === 'Different passage' ? first : second,
        database,
        { apply: true },
      ),
    );
    assert.equal((await database.typingPassage.findMany())[0].text, winner);
  },
);
