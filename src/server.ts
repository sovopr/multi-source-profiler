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

    const csvFile = files?.['csv']?.[0];
    const resumeFile = files?.['resume']?.[0];
    const cleanupUploads = async () => {
      if (csvFile?.path) await fs.promises.unlink(csvFile.path).catch(() => {});
      if (resumeFile?.path) await fs.promises.unlink(resumeFile.path).catch(() => {});
    };

    if (csvFile && !csvFile.originalname.toLowerCase().trim().endsWith('.csv')) {
      await cleanupUploads();
      return res.status(400).json({ error: 'The CSV field requires a valid .csv file' });
    }
    if (resumeFile && !resumeFile.originalname.toLowerCase().trim().endsWith('.pdf')) {
      await cleanupUploads();
      return res.status(400).json({ error: 'The Resume field requires a valid .pdf file' });
    }

    const result = await run({
      csvPath: csvFile?.path,
      githubUsername: githubUsername,
      resumePdfPath: resumeFile?.path
    }, config);

    // Clean up uploaded temp files
    await cleanupUploads();

    res.json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Unknown server error' });
  }
});

app.listen(port, () => {
  console.log(`API Backend running on http://localhost:${port}`);
});
