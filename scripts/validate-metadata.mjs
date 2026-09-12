#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const EXPECTED_UUID = 'weather-effect@quinsaiz.github';
const EXPECTED_SCHEMA_ID = 'org.gnome.shell.extensions.weather-effect';
const EXPECTED_SHELL_VERSIONS = ['45', '46', '47', '48', '49', '50'];

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function readJson(path, label) {
  let source;

  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    fail(`${label} cannot be read: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is invalid JSON: ${error.message}`);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

if (process.argv.length !== 5) {
  fail(`Usage: ${basename(process.argv[1])} METADATA_JSON PACKAGE_JSON SCHEMA_DIRECTORY`);
}

const [, , metadataPath, packagePath, schemaDirectory] = process.argv;
const metadata = readJson(metadataPath, 'metadata');
const packageJson = readJson(packagePath, 'package.json');

if (!isObject(metadata)) {
  fail('metadata must be a JSON object');
}

if (metadata.uuid !== EXPECTED_UUID) {
  fail(`uuid must equal ${EXPECTED_UUID}`);
}

for (const field of ['name', 'description', 'version-name']) {
  if (!isNonEmptyString(metadata[field])) {
    fail(`${field} must be a non-empty string`);
  }
}

if (!isObject(packageJson) || !isNonEmptyString(packageJson.version)) {
  fail('package.json version must be a non-empty string');
}

if (metadata['version-name'] !== packageJson.version) {
  fail('version-name must equal package.json version');
}

if (!Number.isSafeInteger(metadata.version) || metadata.version <= 0) {
  fail('version must be a positive safe integer');
}

if (!Array.isArray(metadata['shell-version']) || metadata['shell-version'].length === 0) {
  fail('shell-version must be a non-empty array');
}

for (const version of metadata['shell-version']) {
  if (typeof version !== 'string' || !/^\d+$/.test(version)) {
    fail('shell-version entries must be non-empty numeric strings');
  }
}

const uniqueShellVersions = new Set(metadata['shell-version']);
if (uniqueShellVersions.size !== metadata['shell-version'].length) {
  fail('shell-version entries must be unique');
}

if (
  uniqueShellVersions.size !== EXPECTED_SHELL_VERSIONS.length ||
  EXPECTED_SHELL_VERSIONS.some(version => !uniqueShellVersions.has(version))
) {
  fail(`shell-version must contain exactly ${EXPECTED_SHELL_VERSIONS.join(', ')}`);
}

if (!isNonEmptyString(metadata['settings-schema'])) {
  fail('settings-schema must be a non-empty string');
}

if (metadata['settings-schema'] !== EXPECTED_SCHEMA_ID) {
  fail(`settings-schema must equal ${EXPECTED_SCHEMA_ID}`);
}

let schemaSources;
try {
  schemaSources = readdirSync(schemaDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.gschema.xml'));
} catch (error) {
  fail(`schema directory cannot be read: ${error.message}`);
}

if (schemaSources.length !== 1) {
  fail(`expected exactly one schema source; found ${schemaSources.length}`);
}

const schemaPath = join(schemaDirectory, schemaSources[0].name);
let schemaXml;
try {
  schemaXml = readFileSync(schemaPath, 'utf8');
} catch (error) {
  fail(`schema source cannot be read: ${error.message}`);
}

const schemaTags = schemaXml.match(/<schema\b[^>]*>/g) ?? [];
if (schemaTags.length !== 1 || !/<\/schema\s*>/.test(schemaXml)) {
  fail('schema source must contain exactly one complete schema declaration');
}

const schemaIdMatch = schemaTags[0].match(/\bid\s*=\s*(["'])(.*?)\1/);
if (!schemaIdMatch || schemaIdMatch[2].trim().length === 0) {
  fail('schema id must be a non-empty string');
}

if (schemaIdMatch[2] !== EXPECTED_SCHEMA_ID) {
  fail(`schema id must equal ${EXPECTED_SCHEMA_ID}`);
}

if (metadata['settings-schema'] !== schemaIdMatch[2]) {
  fail('settings-schema must equal the maintained schema id');
}
