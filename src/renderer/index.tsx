// reflect-metadata phải nạp TRƯỚC mọi file có decorator của tsyringe.
import 'reflect-metadata';

import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { App } from './App';
import { configureContainer, container } from './services/container';
import { LanguageDetectorProvider } from './services/detection/LanguageDetector';
import { IPlatformService } from './services/platform/IPlatformService';
import { TOKENS } from './services/tokens';

configureContainer();

const providers = container.resolveAll<LanguageDetectorProvider>(TOKENS.LanguageDetectorProvider);
const platform = container.resolve<IPlatformService>(TOKENS.PlatformService);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Không tìm thấy #root trong index.html');

ReactDOM.render(<App providers={providers} platform={platform} />, rootEl);
