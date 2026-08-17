import { readFile } from 'node:fs/promises';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

const packageJson = await readJson('../package.json');
const packageLock = await readJson('../package-lock.json');
const sbom = await readJson('../public/SBOM.runtime.json');
const versions = {
  package: packageJson.version,
  lockfile: packageLock.version,
  lockfileRoot: packageLock.packages?.['']?.version,
  sbom: sbom.metadata?.component?.version,
};
const unique = new Set(Object.values(versions));
if (unique.size !== 1 || unique.has(undefined)) {
  throw new Error(`Release metadata version drift: ${JSON.stringify(versions)}`);
}
if (packageJson.license !== 'MIT' || packageLock.packages?.['']?.license !== 'MIT') {
  throw new Error('The source package and lockfile root must explicitly declare the MIT license.');
}
process.stdout.write(`Release metadata verified: v${packageJson.version}, MIT\n`);
