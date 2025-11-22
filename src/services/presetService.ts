import _ from 'lodash';
import { getRequest } from '../utils/http';
import { getAddonConfig as getAioListsConfig } from '../api/aiolistsApi';
// import { getAddonConfig as getMediaFusionConfig } from '../api/mediafusionApi';
import { getAddonConfig as getStremthruConfig } from '../api/stremthruApi';
import {
  updateTransportUrl,
  encodeDataFromTransportUrl
} from '../utils/transportUrl';
import { Buffer } from 'buffer';
import { debridServicesInfo, type DebridService } from '../utils/debrid';
import { convertToBytes, convertToMegabytes } from '../utils/sizeConverters';
import { setAddonCollection } from '../api/stremioApi';

// Global squirrelly
declare const Sqrl: {
  render(template?: string | undefined, data?: unknown): string;
};

interface BuildPresetServiceParams {
  preset: string;
  language: string;
  extras: string[];
  options: string[];
  maxSize: string | number;
  rpdbKey?: string;
  debridService?: string;
  debridApiKey?: string | null;
  isDebridApiKeyValid?: boolean;
  mediaFlowProxyUrl?: string;
  mediaFlowProxyPassword?: string;
}

export async function buildPresetService(params: BuildPresetServiceParams) {
  const {
    preset,
    language,
    extras,
    options,
    maxSize,
    rpdbKey,
    debridService,
    debridApiKey,
    isDebridApiKeyValid,
    mediaFlowProxyUrl,
    mediaFlowProxyPassword
  } = params;

  const data: any = await getRequest('/preset.json');
  if (!data) throw new Error('Failed to fetch presets');

  let presetConfig: any = {};
  let no4k = options.includes('no4k');
  let cached = options.includes('cached');
  let limit = ['minimal', 'kids'].includes(preset) ? 2 : (preset.startsWith('ita') ? 5 : 10);
  let size = maxSize ? maxSize : '';

  // const mediaFusionConfig = data.mediafusionConfig;
  const aiolistsConfig =
    preset === 'kids' ? data.aiolistsKidsConfig : data.aiolistsConfig;

  // Language specific addons
  if (language === 'es-MX') {
    data.presets[preset].push('subdivx');
  }

  // Preset
  const actualPreset = preset.startsWith('ita') ? 'ita' : preset;
  presetConfig = _.pick(
    language === 'en'
      ? data.languages[language]
      : _.merge({}, data.languages.en, data.languages[language]),
    data.presets[actualPreset]
  );

  // Extras
  if (extras.length > 0) {
    extras.forEach((extra) => {
      _.merge(presetConfig, { [extra]: data.extras[extra] });
    });
  }

  // AIOLists options
  if (aiolistsConfig && aiolistsConfig.config) {
    aiolistsConfig.config.tmdbLanguage =
      language === 'es-MX' || language === 'es-ES' ? 'es' : language;
    aiolistsConfig.config = _.merge(
      {},
      aiolistsConfig.config,
      language !== 'en' ? aiolistsConfig[language] : {}
    );

    if (rpdbKey) {
      aiolistsConfig.config.rpdbApiKey = rpdbKey;
      aiolistsConfig.config.isConnected =
        aiolistsConfig.config.isConnected || {};
      aiolistsConfig.config.isConnected.rpdb = true;
    }
  }

  // AIOLists request
  if (presetConfig.aiolists && aiolistsConfig) {
    try {
      const aiolistsData = await getAioListsConfig(aiolistsConfig);
      if (aiolistsData && aiolistsData.manifest && aiolistsData.transportUrl) {
        presetConfig.aiolists.manifest = aiolistsData.manifest;
        presetConfig.aiolists.transportUrl = aiolistsData.transportUrl;
      } else {
        presetConfig = _.omit(presetConfig, 'aiolists');
      }
    } catch (e) {
      presetConfig = _.omit(presetConfig, 'aiolists');
    }
  }

  let debridServiceName = '';
  let torrentioConfig = '';
  let peerflixConfig = '';

  // Debrid config
  if (isDebridApiKeyValid) {
    debridServiceName = debridServicesInfo[
      debridService as keyof typeof debridServicesInfo
    ].name as DebridService;

    // Torrentio
    if (presetConfig.torrentio) {
      torrentioConfig = `|sort=qualitysize|debridoptions=${cached ? 'nodownloadlinks,' : ''}nocatalog|${debridService}=${debridApiKey}`;
    }

    // Comet
    if (presetConfig.comet) {
      updateTransportUrl({
        presetConfig,
        serviceKey: 'comet',
        manifestNameSuffix: debridServiceName,
        updateData: (data: any) => ({
          ...data,
          debridApiKey,
          debridService,
          cachedOnly: cached
        })
      });
    }

    // MediaFusion
    // if (presetConfig.mediafusion) {
    //   if (
    //     presetConfig.mediafusion.manifest &&
    //     presetConfig.mediafusion.manifest.name
    //   ) {
    //     presetConfig.mediafusion.manifest.name += ` | ${debridServiceName}`;
    //   }
    //   mediaFusionConfig.streaming_provider = {
    //     service: debridService,
    //     token: debridApiKey,
    //     enable_watchlist_catalogs: false,
    //     download_via_browser: false,
    //     only_show_cached_streams: cached
    //   };
    // }

    // TorrentsDB
    if (presetConfig.torrentsdb) {
      updateTransportUrl({
        presetConfig,
        serviceKey: 'torrentsdb',
        manifestNameSuffix: debridServiceName,
        updateData: (data: any) => ({
          ...data,
          sort: 'qualitysize',
          [debridService as string]: debridApiKey
        })
      });
    }

    // Jackettio
    if (presetConfig.jackettio) {
      updateTransportUrl({
        presetConfig,
        serviceKey: 'jackettio',
        updateData: (data: any) => ({
          ...data,
          debridApiKey,
          debridId: debridService,
          hideUncached: cached,
          qualities: no4k ? _.pull(data.qualities, 2160) : data.qualities,
          mediaflowProxyUrl: mediaFlowProxyUrl || '',
          mediaflowApiPassword: mediaFlowProxyPassword || '',
          enableMediaFlow: !!mediaFlowProxyUrl
        })
      });
    }

    // StremThru Torz
    if (presetConfig.stremthrutorz) {
      const stremthrutorzDebridService: Record<string, string> = {
        realdebrid: 'rd',
        alldebrid: 'ad',
        premiumize: 'pm',
        debridlink: 'dl',
        torbox: 'tb'
      };

      updateTransportUrl({
        presetConfig,
        serviceKey: 'stremthrutorz',
        manifestNameSuffix: debridServiceName,
        updateData: (data: any) => ({
          ...data,
          stores: [
            {
              c: stremthrutorzDebridService[debridService as string],
              t: debridApiKey
            }
          ],
          cached
        })
      });
    }

    // Sootio
    if (presetConfig.sootio) {
      if (debridService !== 'debridlink' && debridService !== 'easydebrid') {
        const sootioDebridService: Record<string, string> = {
          realdebrid: 'RealDebrid',
          alldebrid: 'AllDebrid',
          premiumize: 'Premiumize',
          torbox: 'TorBox'
        };

        updateTransportUrl({
          presetConfig,
          serviceKey: 'sootio',
          manifestNameSuffix: debridServiceName,
          updateData: (data: any) => ({
            ...data,
            DebridServices: [
              {
                provider: sootioDebridService[debridService as string],
                apiKey: debridApiKey
              }
            ],
            maxSize: size ? size : 200,
            DebridProvider: sootioDebridService[debridService as string],
            DebridApiKey: debridApiKey
          }),
          base64: false
        });
      } else {
        presetConfig = _.omit(presetConfig, 'sootio');
      }
    }

    // Peerflix
    if (presetConfig.peerflix) {
      if (debridService !== 'easydebrid') {
        peerflixConfig = `%7Cdebridoptions=nocatalog${cached ? ',nodownloadlinks' : ''}%7C${debridService}=${debridApiKey}`;
      } else {
        presetConfig = _.omit(presetConfig, 'peerflix');
      }
    }

    // Torbox
    if (debridService === 'torbox' && presetConfig.torbox) {
      presetConfig.torbox.transportUrl = Sqrl.render(
        presetConfig.torbox.transportUrl,
        {
          transportUrl: debridApiKey
        }
      );
    } else {
      presetConfig = _.omit(presetConfig, 'torbox');
    }

    // StreamAsia
    if (presetConfig.streamasia && debridService !== 'easydebrid') {
      const streamAsiaDebridService: Record<string, string> = {
        realdebrid: 'Real Debrid',
        alldebrid: 'AllDebrid',
        premiumize: 'Premiumize',
        debridlink: 'Debrid-Link',
        torbox: 'Torbox'
      };

      updateTransportUrl({
        presetConfig,
        serviceKey: 'streamasia',
        manifestNameSuffix: debridServiceName,
        updateData: (data: any) => ({
          ...data,
          debridConfig: [
            {
              debridProvider: streamAsiaDebridService[debridService as string],
              token: debridApiKey
            }
          ]
        })
      });
    }

    // StremThru Store
    if (presetConfig.stremthrustore) {
      updateTransportUrl({
        presetConfig,
        serviceKey: 'stremthrustore',
        manifestNameSuffix: debridServiceName,
        updateData: (data: any) => ({
          ...data,
          store_name: debridService,
          store_token: debridApiKey
        })
      });

      try {
        const manifestStremthruStoreUserData = await getStremthruConfig(
          presetConfig.stremthrustore.transportUrl
        );

        if (manifestStremthruStoreUserData) {
          presetConfig.stremthrustore.manifest = manifestStremthruStoreUserData;
        }
      } catch (error) {
        presetConfig = _.omit(presetConfig, 'stremthrustore');
      }
    }

    // Remove TPB+
    presetConfig = _.omit(presetConfig, 'tpbplus');
  } else {
    presetConfig = _.omit(presetConfig, 'jackettio');
    presetConfig = _.omit(presetConfig, 'sootio');
    presetConfig = _.omit(presetConfig, 'torbox');
  }

  // IlCorsaroViola
  if (presetConfig.ilcorsaroviola) {
    let config: any = {
      tmdb_key: '5462f78469f3d80bf5201645294c16e4',
      use_corsaronero: true,
      use_uindex: true,
      use_knaben: true
    };

    if (isDebridApiKeyValid && (debridService === 'realdebrid' || debridService === 'torbox')) {
      // Debrid Configuration
      if (debridService === 'realdebrid') {
        config.use_rd = true;
        config.rd_key = debridApiKey;
      }
      if (debridService === 'torbox') {
        config.use_torbox = true;
        config.torbox_key = debridApiKey;
      }
    } else {
      // NO Debrid Configuration
      config.max_res_limit = 5;
    }

    const encodedConfig = encodeDataFromTransportUrl(config);
    presetConfig.ilcorsaroviola.transportUrl = `https://ilcorsaroviola.vercel.app/${encodedConfig}/manifest.json`;

    if (debridServiceName) {
      presetConfig.ilcorsaroviola.manifest.name += ` | ${debridServiceName}`;
    }
  }

  // StreamVix
  if (presetConfig.streamvix) {
    let config: any = {
      disableLiveTv: false,
      vavooNoMfpEnabled: true,
      disableVixsrc: false,
      vixDirect: false,
      vixDirectFhd: true,
      vixProxy: false,
      vixProxyFhd: false,
      guardahdEnabled: true,
      streamingwatchEnabled: true,
      guardaserieEnabled: true,
      eurostreamingEnabled: false,
      loonexEnabled: true,
      animesaturnEnabled: true,
      animeworldEnabled: true,
      animeunityEnabled: true,
      animeunityAuto: false,
      animeunityFhd: true
    };

    if (mediaFlowProxyUrl && mediaFlowProxyPassword) {
      // MFP Configuration
      config = {
        ...config,
        mediaflowMaster: true,
        mediaFlowProxyUrl,
        mediaFlowProxyPassword,
        cb01Enabled: true,
        toonitaliaEnabled: true
      };
      presetConfig.streamvix.manifest.name += ` | MFP`;
    } else {
      // NO MFP Configuration
      config = {
        ...config,
        mediaflowMaster: false,
        mediaFlowProxyUrl: "",
        mediaFlowProxyPassword: "",
        cb01Enabled: false,
        toonitaliaEnabled: false
      };
    }

    const encodedConfig = encodeURIComponent(JSON.stringify(config));
    presetConfig.streamvix.transportUrl = `https://streamvix.hayd.uk/${encodedConfig}/manifest.json`;
  }

  // TvVoo
  if (presetConfig.tvvoo) {
    if (mediaFlowProxyUrl && mediaFlowProxyPassword) {
      const encodedUrl = Buffer.from(mediaFlowProxyUrl).toString('base64').replace(/=/g, '');
      const encodedPsw = Buffer.from(mediaFlowProxyPassword).toString('base64').replace(/=/g, '');
      presetConfig.tvvoo.transportUrl = `https://tvvoo.hayd.uk/cfg-it-mfu_${encodedUrl}-mfp_${encodedPsw}/manifest.json`;
      presetConfig.tvvoo.manifest.name += ` | MFP`;
    } else {
      presetConfig.tvvoo.transportUrl = `https://tvvoo.hayd.uk/cfg-it/manifest.json`;
    }
  }

  // Torrrentio
  if (presetConfig.torrentio) {
    presetConfig.torrentio.transportUrl = Sqrl.render(
      presetConfig.torrentio.transportUrl,
      {
        transportUrl: torrentioConfig,
        no4k: no4k ? '4k,' : '',
        limit,
        maxSize: size ? `|sizefilter=${size}GB` : ''
      }
    );
    if (debridServiceName) {
      presetConfig.torrentio.manifest.name += ` | ${debridServiceName}`;
    }
  }

  // Comet
  if (presetConfig.comet) {
    updateTransportUrl({
      presetConfig,
      serviceKey: 'comet',
      updateData: (data: any) => ({
        ...data,
        maxResultsPerResolution: limit,
        maxSize: size ? convertToBytes(size) : 0,
        resolutions: {
          ...data.resolutions,
          r2160p: no4k ? false : true
        }
      })
    });
  }

    // MediaFusion
    // Removed as per user request due to API timeouts
    if (presetConfig.mediafusion) {
      presetConfig = _.omit(presetConfig, 'mediafusion');
    }  // TorrentsDB
  if (presetConfig.torrentsdb) {
    updateTransportUrl({
      presetConfig,
      serviceKey: 'torrentsdb',
      updateData: (data: any) => ({
        ...data,
        sizefilter: size ? convertToMegabytes(size) : '',
        qualityfilter: [
          ...data.qualityfilter,
          ...(no4k
            ? ['4k', 'brremux', 'hdrall', 'dolbyvisionwithhdr', 'dolbyvision']
            : [])
        ]
      })
    });
  }

  // Peerflix
  if (presetConfig.peerflix) {
    if (debridService !== '' && debridService !== 'easydebrid') {
      presetConfig.peerflix.transportUrl = Sqrl.render(
        presetConfig.peerflix.transportUrl,
        {
          transportUrl: peerflixConfig,
          no4k: no4k ? ',remux4k,4k,micro4k' : '',
          sort: debridService ? ',size-desc' : ',seed-desc'
        }
      );
      if (debridServiceName) {
        presetConfig.peerflix.manifest.name += ` | ${debridServiceName}`;
      }
    }
  }

  const selectedAddons = Object.keys(presetConfig).map((k) => presetConfig[k]);

  return {
    presetConfig,
    selectedAddons,
    debridServiceName,
    torrentioConfig,
    peerflixConfig
  };
}

interface LoadPresetServiceParams {
  addons: any[];
  key: string;
}

export async function loadPresetService({
  addons,
  key
}: LoadPresetServiceParams) {
  if (!key) {
    throw new Error('No auth key provided');
  }

  const res = await setAddonCollection(addons, key);
  if (!res?.result?.success) {
    throw new Error(res?.result?.error || 'Sync failed');
  }

  return res;
}
