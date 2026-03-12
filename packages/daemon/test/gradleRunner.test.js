const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { GradleRunner } = require('../out/gradle/index.js');

test('GradleRunner.resolveGradlew returns the wrapper path when present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-drift-gradle-'));
  const wrapperName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const wrapperPath = path.join(tmpDir, wrapperName);

  fs.writeFileSync(wrapperPath, 'echo ok\n');

  const runner = new GradleRunner();
  const resolved = runner.resolveGradlew(tmpDir);

  assert.equal(resolved, wrapperPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GradleRunner.resolveGradlew throws when the wrapper is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-drift-gradle-missing-'));
  const runner = new GradleRunner();

  assert.throws(
    () => runner.resolveGradlew(tmpDir),
    /Gradle wrapper not found/
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
