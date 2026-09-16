import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { buildAppConfig } from './app/app.config';
import { loadRuntimeConfig } from './app/runtime-config';

async function main(): Promise<void> {
  const config = await loadRuntimeConfig();
  await bootstrapApplication(AppComponent, buildAppConfig(config));
}

main().catch((error: unknown) => {
  // The console is the only sink that exists before the app boots: there is no
  // router, no ErrorHandler and no DOM of ours to render into yet. Narrowly
  // scoped to this one line; listed as an accepted deviation in the report.
  // eslint-disable-next-line no-console
  console.error('Fullstack Loop frontend failed to bootstrap', error);
});
