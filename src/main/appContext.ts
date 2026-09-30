import { DatabaseManager } from '../services/DatabaseManager';
import { DownloadService } from '../services/DownloadService';
import { HomeFeedService } from '../services/HomeFeedService';
import { ScheduleService } from '../services/ScheduleService';
import { ProviderManager } from '../services/ProviderManager';
import { ProviderGateway } from '../services/ProviderGateway';

export interface MainContext {
  providerManager: ProviderManager;
  providerGateway: ProviderGateway;
  homeFeedService: HomeFeedService;
  scheduleService: ScheduleService;
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
    scheduleService: new ScheduleService(providerGateway),
    downloadService: dependencies.downloadService,
    database: dependencies.database,
  };
}
