import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { run } from './pipeline';

const program = new Command();

program
  .name('candidate-transformer')
  .description('Transforms messy multi-source candidate data into a canonical profile')
  .version('1.0.0')
  .option('--csv <path>', 'path to recruiter CSV')
  .option('--github <username>', 'GitHub username')
  .option('--resume <path>', 'path to resume PDF')
  .option('--config <path>', 'path to output config JSON')
  .option('--out <path>', 'output file path (defaults to stdout)')
  .option('--pretty', 'pretty-print JSON output')
  .option('--strict', 'exit non-zero on validation errors')
  .action(async (options) => {
    try {
      let config = undefined;
      if (options.config) {
        const configPath = path.resolve(options.config);
        config = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'));
      }

      const result = await run({
        csvPath: options.csv ? path.resolve(options.csv) : undefined,
        githubUsername: options.github,
        resumePdfPath: options.resume ? path.resolve(options.resume) : undefined
      }, config);

      const outputData = result.projected || result.canonical;
      const jsonStr = options.pretty ? JSON.stringify(outputData, null, 2) : JSON.stringify(outputData);

      if (options.out) {
        await fs.promises.writeFile(path.resolve(options.out), jsonStr, 'utf-8');
      } else {
        console.log(jsonStr);
      }

      // Surface validation errors to stderr
      if (result.errors && result.errors.length > 0) {
        console.error(`\n⚠ Validation warnings (${result.errors.length}):`);
        for (const err of result.errors) {
          console.error(`  - ${err}`);
        }
        if (options.strict) {
          process.exit(1);
        }
      }
      
      process.exit(0);
    } catch (error: any) {
      console.error(JSON.stringify({ error: error.message || 'Unknown error' }, null, 2));
      process.exit(1);
    }
  });

program.parse();
