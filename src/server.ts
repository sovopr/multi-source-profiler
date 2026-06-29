import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { run } from './pipeline';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

app.post('/api/transform', upload.fields([{ name: 'csv' }, { name: 'resume' }]), async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const githubUsername = req.body.github;
    const configStr = req.body.config;

    let config = undefined;
    if (configStr) {
      try {
        config = JSON.parse(configStr);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid config JSON format' });
      }
    }

    const result = await run({
      csvPath: files?.['csv']?.[0]?.path,
      githubUsername: githubUsername,
      resumePdfPath: files?.['resume']?.[0]?.path
    }, config);

    // Clean up uploaded temp files
    if (files?.['csv']?.[0]?.path) await fs.promises.unlink(files['csv'][0].path).catch(() => {});
    if (files?.['resume']?.[0]?.path) await fs.promises.unlink(files['resume'][0].path).catch(() => {});

    res.json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Unknown server error' });
  }
});

app.listen(port, () => {
  console.log(`API Backend running on http://localhost:${port}`);
});
