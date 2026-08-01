// /api/scan-zip - scan a codebase that isn't on GitHub at all: private
// repos, GitLab/Bitbucket exports, or just a folder zipped up locally.
// Same analysis engine as /api/scan.js — this endpoint only differs in
// how files are obtained (an uploaded ZIP instead of GitHub's API).
//
// PLATFORM LIMIT, worth being upfront about: Vercel serverless functions
// on the free tier cap request bodies at ~4.5MB, so this only works for
// zips under that size. The UI enforces the same limit before upload so
// the failure is a clear message, not a silent timeout.

const JSZip = require('jszip');
const { SKIP_DIRS, EXT_PATTERN, runAnalysisPipeline } = require('./_lib/analyze');

const MAX_ZIP_BYTES = 4.5 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const chunks = [];
  let total = 0;
  let tooLarge = false;

  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_ZIP_BYTES) {
        tooLarge = true;
        req.destroy();
        return resolve();
      }
      chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('error', reject);
  });

  if (tooLarge) {
    return res.status(413).json({ error: `That ZIP is over the ${(MAX_ZIP_BYTES / (1024 * 1024)).toFixed(1)}MB limit for this live demo. For larger codebases, use the CLI tool instead — see github.com/itsgreybox/greybox.` });
  }
  if (!chunks.length) {
    return res.status(400).json({ error: 'No file received. Choose a .zip file of your codebase.' });
  }

  const buffer = Buffer.concat(chunks);
  const forceLanguage = req.headers['x-force-language'] || null;

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    return res.status(400).json({ error: 'Could not read that file as a ZIP archive. Make sure it\'s a standard .zip export.' });
  }

  const entries = Object.values(zip.files).filter(f =>
    !f.dir && EXT_PATTERN.test(f.name) && !SKIP_DIRS.some(d => f.name.split('/').includes(d))
  );

  if (!entries.length) {
    return res.status(404).json({ error: 'No Python, Java, JavaScript, Vue, C#, COBOL, or Go files found in that ZIP.' });
  }

  const fileEntries = entries.map(f => ({
    path: f.name,
    getSource: async () => f.async('string'),
  }));

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const result = await runAnalysisPipeline(fileEntries, { forceLanguage, apiKey });

    return res.status(200).json({
      repo: 'uploaded ZIP',
      source_type: 'zip',
      ...result,
      note: `Analyzed up to ${result.files_scanned} files from the uploaded ZIP using a simplified regex-based analyzer. For full-repo coverage with accurate AST parsing, use the CLI tool - see github.com/itsgreybox/greybox.`,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: String(err.message || err) });
  }
};

// Disable Vercel's default JSON body parser — we need the raw request
// stream to read binary ZIP bytes, not parsed JSON. Also raise the
// execution budget from Vercel's short default for larger uploads.
module.exports.config = { api: { bodyParser: false }, maxDuration: 60 };
