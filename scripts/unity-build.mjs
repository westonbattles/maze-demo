import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const play = join(root, 'public/play');
const cache = join(root, '.unity-build');
const manifestPath = join(root, 'unity-build.json');
const archive = join(cache, 'maze-demo.tar.gz');
const stamp = join(cache, 'restored-sha');

async function exists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function importBuild(folder) {
  if (!folder) throw new Error('Usage: npm run demo:import -- "/path/to/Unity/Web/build"');
  const source = resolve(folder);
  if (source === play || source.startsWith(`${play}/`)) throw new Error('Import the original Unity export folder.');
  const files = await readdir(join(source, 'Build'));
  const find = pattern => {
    const matches = files.filter(file => pattern.test(file));
    if (matches.length !== 1) throw new Error(`Expected one ${pattern} file in Build. Enable Decompression Fallback in Unity for compressed builds.`);
    return `Build/${matches[0]}`;
  };
  const config = {
    loaderUrl: find(/\.loader\.js$/),
    dataUrl: find(/\.data(?:\.unityweb)?$/),
    frameworkUrl: find(/\.framework\.js(?:\.unityweb)?$/),
    codeUrl: find(/\.wasm(?:\.unityweb)?$/),
    streamingAssetsUrl: 'StreamingAssets',
    companyName: 'DefaultCompany',
    productName: 'Summer Game',
    productVersion: '0.1.0',
  };

  await mkdir(play, { recursive: true });
  await mkdir(cache, { recursive: true });
  // These folders contain imported output, never website source files.
  await rm(join(play, 'Build'), { recursive: true, force: true });
  await rm(join(play, 'StreamingAssets'), { recursive: true, force: true });
  await cp(join(source, 'Build'), join(play, 'Build'), { recursive: true });
  const entries = ['Build', 'build.json'];
  if (await exists(join(source, 'StreamingAssets'))) {
    await cp(join(source, 'StreamingAssets'), join(play, 'StreamingAssets'), { recursive: true });
    entries.push('StreamingAssets');
  }
  await writeFile(join(play, 'build.json'), `${JSON.stringify(config, null, 2)}\n`);
  execFileSync('tar', ['-czf', archive, '-C', play, ...entries], { stdio: 'inherit' });
  const hash = await sha256(archive);
  const manifest = {
    repository: 'westonbattles/maze-demo',
    tag: `unity-build-${hash.slice(0, 12)}`,
    asset: 'maze-demo.tar.gz',
    sha256: hash,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(stamp, hash);
  console.log('Unity build imported. Run npm run demo:publish to upload it, then commit and push the website changes.');
}

async function restoreBuild() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (await exists(stamp) && (await readFile(stamp, 'utf8')) === manifest.sha256 && await exists(join(play, 'build.json'))) {
    const config = JSON.parse(await readFile(join(play, 'build.json'), 'utf8'));
    if ((await Promise.all(['loaderUrl', 'dataUrl', 'frameworkUrl', 'codeUrl'].map(key => exists(join(play, config[key]))))).every(Boolean)) return;
  }
  await mkdir(cache, { recursive: true });
  await mkdir(play, { recursive: true });
  console.log(`Downloading Unity build ${manifest.tag}…`);
  execFileSync('gh', ['release', 'download', manifest.tag, '--repo', manifest.repository, '--pattern', manifest.asset, '--dir', cache, '--clobber'], { stdio: 'inherit' });
  if (await sha256(archive) !== manifest.sha256) throw new Error('Unity build checksum did not match.');
  await rm(join(play, 'Build'), { recursive: true, force: true });
  await rm(join(play, 'StreamingAssets'), { recursive: true, force: true });
  execFileSync('tar', ['-xzf', archive, '-C', play], { stdio: 'inherit' });
  await writeFile(stamp, manifest.sha256);
  console.log('Unity build ready.');
}

async function publishBuild() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (await sha256(archive) !== manifest.sha256) throw new Error('Import the build again before publishing.');
  execFileSync('gh', ['release', 'create', manifest.tag, archive, '--repo', manifest.repository,
    '--title', 'Maze demo Web build', '--notes', 'Unity Web build included in the maze demo website.', '--latest=false'], { stdio: 'inherit' });
  console.log('Build uploaded. Commit and push the website changes to deploy it.');
}

try {
  const command = process.argv[2];
  if (command === 'import') await importBuild(process.argv[3]);
  else if (command === 'restore') await restoreBuild();
  else if (command === 'publish') await publishBuild();
  else throw new Error('Use import, restore, or publish.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
