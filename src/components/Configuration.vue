<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Buffer } from 'buffer';
import draggable from 'vuedraggable';
import AddonItem from './AddonItem.vue';
import DynamicForm from './DynamicForm.vue';
import _ from 'lodash';
import { QuestionMarkCircleIcon } from '@heroicons/vue/24/outline';
import { addNotification } from '../composables/useNotifications';
import { useAnalytics } from '../composables/useAnalytics';
import { isValidApiKey, debridServicesInfo } from '../utils/debrid.ts';
import {
  buildPresetService,
  loadPresetService
} from '../services/presetService.ts';

const { t } = useI18n();

const props = defineProps({
  stremioAuthKey: { type: String }
});

let dragging = false;
let addons = ref([]);
let extras = ref([]);
let options = ref([]);
let maxSize = ref('');
let isSyncButtonEnabled = ref(false);
let isLoadingPreset = ref(false);
let isSyncAddons = ref(false);
let language = ref('it');
let preset = ref('ita-nomfp');

let debridService = ref('');
let debridApiKey = ref(null);
let debridApiUrl = ref('');
let debridServiceName = '';

let mediaFlowProxyUrl = ref('');
let mediaFlowProxyPassword = ref('');

const isDebridApiKeyValid = computed(() =>
  isValidApiKey(debridService.value, debridApiKey.value)
);

let torrentioConfig = '';
let peerflixConfig = '';
let rpdbKey = ref('');
let isEditModalVisible = ref(false);
let currentManifest = ref({});
let currentEditIdx = ref(null);

const showDebrid = computed(() => preset.value.includes('rd'));
const showMediaFlow = computed(() => preset.value.includes('mfp'));

watch(
  [
    () => props.stremioAuthKey,
    preset,
    language,
    extras,
    options,
    maxSize,
    rpdbKey,
    debridService,
    debridApiKey,
    mediaFlowProxyUrl,
    mediaFlowProxyPassword
  ],
  _.debounce(() => {
    loadUserAddons();
  }, 500),
  { deep: true }
);

onMounted(() => {
  loadUserAddons();
});

async function loadUserAddons() {
  const key = props.stremioAuthKey;

  if (!key) {
    console.error('No auth key provided');
    return;
  }

  isLoadingPreset.value = true;
  isSyncButtonEnabled.value = false;
  console.log('Loading addons...');

  try {
    const {
      selectedAddons,
      presetConfig: builtPresetConfig,
      debridServiceName: builtDebridServiceName,
      torrentioConfig: builtTorrentioConfig,
      peerflixConfig: builtPeerflixConfig
    } = await buildPresetService({
      preset: preset.value,
      language: language.value,
      extras: extras.value,
      options: options.value,
      maxSize: maxSize.value,
      rpdbKey: rpdbKey.value,
      debridService: debridService.value,
      debridApiKey: debridApiKey.value,
      isDebridApiKeyValid: isDebridApiKeyValid.value,
      mediaFlowProxyUrl: mediaFlowProxyUrl.value,
      mediaFlowProxyPassword: mediaFlowProxyPassword.value
    });

    addons.value = selectedAddons;
    debridServiceName = builtDebridServiceName;
    torrentioConfig = builtTorrentioConfig;
    peerflixConfig = builtPeerflixConfig;
  } catch (error) {
    console.error('Error fetching preset config', error);
    addNotification(t('failed_fetching_presets'), 'error');
  } finally {
    isSyncButtonEnabled.value = true;
    isLoadingPreset.value = false;
  }
}

async function syncUserAddons() {
  const { track } = useAnalytics();
  const key = props.stremioAuthKey;
  if (!key) {
    console.error('No auth key provided');
    return;
  }

  isSyncAddons.value = true;
  console.log('Syncing addons...');

  try {
    const data = await loadPresetService({ addons: addons.value, key });
    addNotification(t('sync_complete'), 'success');
    track('sync_stremio_click', {
      title: 'Sync to Stremio',
      vars: {
        language: language.value,
        preset: preset.value,
        debrid: debridService.value || ''
      }
    });
    console.log('Sync complete: ', data);
  } catch (error) {
    addNotification(error.message || t('failed_syncing_addons', 'error'));
    console.error('Sync failed', error);
  } finally {
    isSyncAddons.value = false;
  }
}

function removeAddon(idx) {
  addons.value.splice(idx, 1);
}

function getNestedObjectProperty(obj, path, defaultValue = null) {
  try {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  } catch (e) {
    return defaultValue;
  }
}

function openEditModal(idx) {
  isEditModalVisible.value = true;
  currentEditIdx.value = idx;
  currentManifest.value = { ...addons.value[idx].manifest };
  document.body.classList.add('modal-open');
}

function closeEditModal() {
  isEditModalVisible.value = false;
  currentManifest.value = {};
  currentEditIdx.value = null;
  document.body.classList.remove('modal-open');
}

function saveManifestEdit(updatedManifest) {
  try {
    addons.value[currentEditIdx.value].manifest = updatedManifest;
    closeEditModal();
  } catch (e) {
    addNotification(t('failed_update_manifest', 'error'));
  }
}

function updateDebridApiUrl() {
  debridApiUrl.value = debridServicesInfo[debridService.value].url;
}
</script>

<template>
  <section id="configure" class="max-w-4xl mx-auto p-4">
    <h3 class="text-2xl font-bold mb-6">
      {{ $t('configure') }}
    </h3>

    <form class="space-y-4" onsubmit="return false;">
      <!-- Step 1: Select Preset -->
      <fieldset class="bg-base-100 p-6 rounded-lg border border-base-300">
        <legend class="text-sm">
          {{ $t('step1_select_preset') }}
        </legend>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label class="label cursor-pointer">
            <input
              type="radio"
              value="ita-nomfp"
              v-model="preset"
              class="radio radio-primary"
            />
            <span class="label-text ml-2">BASE (NO MediaflowProxy)</span>
          </label>
          <label class="label cursor-pointer">
            <input
              type="radio"
              value="ita-mfp"
              v-model="preset"
              class="radio radio-primary"
            />
            <span class="label-text ml-2">PRO (CON MediaflowProxy)</span>
          </label>
          <label class="label cursor-pointer">
            <input
              type="radio"
              value="ita-rd"
              v-model="preset"
              class="radio radio-primary"
            />
            <span class="label-text ml-2">PRO Debrid</span>
          </label>
          <label class="label cursor-pointer">
            <input
              type="radio"
              value="ita-rd-mfp"
              v-model="preset"
              class="radio radio-primary"
            />
            <span class="label-text ml-2">PRO Debrid + MediaflowProxy</span>
          </label>
        </div>
      </fieldset>

      <!-- Step 3: Debrid API Key -->
      <fieldset
        v-if="showDebrid"
        class="bg-base-100 p-6 rounded-lg border border-base-300"
      >
        <legend class="text-sm">
          {{ $t('step3_debrid_api_key') }}
          <a href="#debrid" class="inline-block align-middle">
            <QuestionMarkCircleIcon class="h-5 w-5 text-primary align-middle" />
          </a>
        </legend>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          <label class="label cursor-pointer">
            <input
              type="radio"
              value="realdebrid"
              v-model="debridService"
              @change="updateDebridApiUrl"
              class="radio radio-primary"
            />
            <span class="label-text ml-2">RealDebrid</span>
          </label>
          <label class="label cursor-pointer">
            <input
              type="radio"
              value="torbox"
              v-model="debridService"
              @change="updateDebridApiUrl"
              class="radio radio-primary"
            />
            <span class="label-text ml-2">TorBox</span>
          </label>
        </div>
        <div class="form-control w-full">
          <input
            v-model="debridApiKey"
            :disabled="!debridService"
            :class="{ 'input-error': debridApiKey && !isDebridApiKeyValid }"
            type="text"
            class="input input-bordered w-full"
            :placeholder="$t('enter_api_key')"
          />
          <div class="flex justify-between items-center mt-1">
            <span class="label-text-alt">
              <a
                v-if="debridApiUrl"
                target="_blank"
                :href="debridApiUrl"
                class="link link-primary"
              >
                {{ $t('get_api_key_here') }}
              </a>
            </span>
            <span
              v-if="debridApiKey && !isDebridApiKeyValid"
              class="label-text-alt text-error ml-2 text-xs"
            >
              {{ $t('invalid_debrid_api_key') }}
            </span>
          </div>
        </div>
      </fieldset>

      <!-- Step 3.5: MediaFlow Proxy -->
      <fieldset
        v-if="showMediaFlow"
        class="bg-base-100 p-6 rounded-lg border border-base-300"
      >
        <legend class="text-sm">
          {{ $t('step_mediaflow') }}
        </legend>
        <div class="form-control w-full mb-2">
          <input
            v-model="mediaFlowProxyUrl"
            type="text"
            class="input input-bordered w-full"
            :placeholder="$t('enter_mediaflow_url')"
          />
        </div>
        <div class="form-control w-full">
          <input
            v-model="mediaFlowProxyPassword"
            type="password"
            class="input input-bordered w-full"
            :placeholder="$t('enter_mediaflow_password')"
          />
        </div>
      </fieldset>

      <!-- Step 6: RPDB Key -->
      <fieldset class="bg-base-100 p-6 rounded-lg border border-base-300">
        <legend class="text-sm">
          {{ $t('step6_rpdb_key') }}
          <a
            target="_blank"
            href="https://ratingposterdb.com"
            class="inline-block align-middle"
          >
            <QuestionMarkCircleIcon class="h-5 w-5 text-primary align-middle" />
          </a>
        </legend>
        <input
          v-model="rpdbKey"
          class="input input-bordered w-full"
          :placeholder="$t('enter_rpdb_key')"
        />
      </fieldset>

      <!-- Step 8: Customize Addons -->
      <fieldset class="bg-base-100 p-6 rounded-lg border border-base-300">
        <legend class="text-sm">
          {{ $t('step8_customize_addons') }}
        </legend>
        <draggable
          :list="addons"
          item-key="transportUrl"
          class="space-y-2"
          ghost-class="opacity-50"
          @start="dragging = true"
          @end="dragging = false"
        >
          <template #item="{ element, index }">
            <AddonItem
              :name="element.manifest.name"
              :idx="index"
              :manifestURL="element.transportUrl"
              :logoURL="element.manifest.logo"
              :isDeletable="
                !getNestedObjectProperty(element, 'flags.protected', false)
              "
              :isConfigurable="
                getNestedObjectProperty(
                  element,
                  'manifest.behaviorHints.configurable',
                  false
                )
              "
              @delete-addon="removeAddon"
              @edit-manifest="openEditModal"
            />
          </template>
        </draggable>
      </fieldset>

      <!-- Step 9: Bootstrap Account -->
      <fieldset class="bg-base-100 p-6 rounded-lg border border-base-300">
        <legend class="text-sm">
          {{ $t('step9_bootstrap_account') }}
        </legend>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!isSyncButtonEnabled || isLoadingPreset || isSyncAddons"
          @click="syncUserAddons"
        >
          <span
            v-if="isSyncAddons"
            class="loading loading-spinner loading-sm"
          ></span>
          {{ isSyncAddons ? $t('sync_addons') : $t('sync_to_stremio') }}
        </button>
      </fieldset>
    </form>
  </section>

  <!-- Edit Modal -->
  <dialog v-if="isEditModalVisible" class="modal modal-open">
    <div class="modal-box w-11/12 max-w-5xl">
      <button
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        @click="closeEditModal"
      >
        ✕
      </button>
      <h3 class="font-bold text-lg mb-4">{{ $t('edit_manifest') }}</h3>
      <DynamicForm
        :manifest="currentManifest"
        @update-manifest="saveManifestEdit"
      />
      <div class="modal-action">
        <button class="btn" @click="closeEditModal">{{ $t('close') }}</button>
      </div>
    </div>
  </dialog>
</template>
