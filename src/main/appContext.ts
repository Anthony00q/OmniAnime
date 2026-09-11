import { DatabaseManager } from '../services/DatabaseManager';
import { DownloadService } from '../services/DownloadService';
import { HomeFeedService } from '../services/HomeFeedService';
import { ProviderManager } from '../services/ProviderManager';
import { ProviderGateway } from '../services/ProviderGateway';

export interface MainContext {
  providerManager: ProviderManager;
  providerGateway: ProviderGateway;
  homeFeedService: HomeFeedService;
  downloadService: DownloadService;
  database: DatabaseManager;
}

export interface MainContextDependencies {
  providerManager: ProviderManager;
  downloadService: DownloadService;
  database: DatabaseManager;
}

export function createMainContext(dependencies: MainContextDependencies): MainContext {
  const providerGateway = new ProviderGateway(dependencies.providerManager);

  return {
    providerManager: dependencies.providerManager,
    providerGateway,
    homeFeedService: new HomeFeedService(providerGateway),
    downloadService: dependencies.downloadService,
    database: dependencies.database,
  };
}
