import { DatabaseManager } from '../services/persistence/DatabaseManager';
import { DownloadService } from '../services/downloads/DownloadService';
import { HomeFeedService } from '../services/providers/HomeFeedService';
import { ScheduleService } from '../services/providers/ScheduleService';
import { ProviderManager } from '../services/providers/ProviderManager';
import { ProviderGateway } from '../services/providers/ProviderGateway';

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
