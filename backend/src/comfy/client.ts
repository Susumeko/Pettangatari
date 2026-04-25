import { randomInt, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { appConfig } from '../config.js';
import { getComfyBaseUrl } from './connectionSettings.js';

const execFile = promisify(execFileCallback);

type WorkflowLink = [number, number, number, number, number, string];

interface WorkflowNodePort {
  name: string;
  link?: number | null;
  links?: number[] | null;
}

interface WorkflowNode {
  id: number;
  type: string;
  title?: string;
  pos?: [number, number];
  inputs?: WorkflowNodePort[];
  outputs?: WorkflowNodePort[];
  widgets_values?: unknown[];
  [key: string]: unknown;
}

interface WorkflowGraph {
  last_node_id: number;
  last_link_id: number;
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  [key: string]: unknown;
}

type ApiPromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: {
    title?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ApiPrompt = Record<string, ApiPromptNode>;

type GeneratedImageDescriptor = {
  nodeId: string;
  filename: string;
  subfolder: string;
  type: string;
};

interface ComfyObjectInfoInputSpec {
  input?: {
    required?: Record<string, unknown[]>;
    optional?: Record<string, unknown[]>;
  };
}

export interface ComfyStatus {
  baseUrl: string;
  online: boolean;
  error?: string;
}

export interface ComfyGenerationOptions extends ComfyStatus {
  checkpoints: string[];
  loras: string[];
  upscaleModels: string[];
  defaultCheckpoint: string;
  missingNodes: ComfyMissingNode[];
}

export interface ComfyMissingNode {
  workflowKind: 'sprite' | 'cg';
  nodeId: number;
  nodeType: string;
  nodeTitle: string;
}

export interface ComfyLoraSelection {
  name: string;
  strength: number;
}

export interface ComfyImageGenerationRequest {
  workflowKind: 'sprite' | 'cg';
  characterName: string;
  label: string;
  variantNumber: number;
  prompt: string;
  negativePrompt?: string;
  checkpoint: string;
  steps?: number;
  upscaleModel: string;
  loras: ComfyLoraSelection[];
  latentWidth?: number;
  latentHeight?: number;
  skipFaceDetailer?: boolean;
  skipBackgroundRemoval?: boolean;
  generateDepthMap?: boolean;
  generateAnimationFrames?: boolean;
  animationFramePrompts?: {
    closedEyes?: string;
    openMouth?: string;
  };
}

export interface ComfyGeneratedImage {
  dataUrl: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  depthMap?: ComfyGeneratedImage;
  animationFrames?: {
    closedEyes?: ComfyGeneratedImage;
    openMouth?: ComfyGeneratedImage;
  };
  depthMapError?: string;
}

const COMFY_PING_ENDPOINTS = ['/system_stats', '/queue'];
const COMFY_MODEL_ENDPOINTS: Array<{ key: 'checkpoints' | 'loras' | 'upscaleModels'; endpoint: string }> = [
  { key: 'checkpoints', endpoint: '/models/diffusion_models' },
  { key: 'loras', endpoint: '/models/loras' },
  { key: 'upscaleModels', endpoint: '/models/upscale_models' },
];
const PRIMITIVE_INPUT_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN']);
const COMFY_POLL_INTERVAL_MS = 800;
const COMFY_GENERATION_TIMEOUT_MS = 3 * 60_000;
const COMFY_REQUEST_TIMEOUT_MS = 15_000;
const K_SAMPLER_CONTROL_MODES = new Set(['fixed', 'increment', 'decrement', 'randomize']);
const FACE_DETAILER_STEPS = 20;
const MOUTH_DETECTOR_MODEL_NAME = 'MouthDetection.pt';
const FACE_DETECTOR_MODEL_INPUT = 'bbox/face_yolov8m.pt';
const MOUTH_DETECTOR_MODEL_INPUT = `bbox/${MOUTH_DETECTOR_MODEL_NAME}`;
const OPEN_MOUTH_SPRITE_SAVE_NODE_ID = '126';
const OPEN_MOUTH_SPRITE_BASE_PROMPT_NODE_ID = '11';
const OPEN_MOUTH_SPRITE_MOUTH_PROMPT_NODE_ID = '129';
const OPEN_MOUTH_SPRITE_BASE_SAMPLER_NODE_ID = '19';
const OPEN_MOUTH_SPRITE_MOUTH_SAMPLER_NODE_ID = '121';
const DEPTH_ANYTHING_MODEL_NAME = 'depth_anything_v2_vitl.pth';
const DEPTH_ANYTHING_DOWNLOAD_URL =
  'https://huggingface.co/depth-anything/Depth-Anything-V2-Large/resolve/main/depth_anything_v2_vitl.pth?download=true';
const VAE_MODEL_NAME = 'vae-ft-mse-8400000-ema-pruned.safetensors';
const VAE_MODEL_ALIASES = [VAE_MODEL_NAME, 'vae-ft-mse-840000-ema-pruned.safetensors'];
const VAE_DOWNLOAD_URL =
  'https://huggingface.co/stabilityai/sd-vae-ft-mse-original/resolve/main/vae-ft-mse-840000-ema-pruned.safetensors?download=true';
const DEPTH_ANYTHING_CONTROLNET_AUX_REPO_DIR = 'Depth-Anything-V2-Large';
const MISSING_NODE_NAME_MAP: Record<string, string> = {
  UltralyticsDetectorProvider: 'ComfyUI Impact Pack',
  BiRefNetRMBG: 'ComfyUI-RMBG',
  FaceDetailer: 'ComfyUI Impact Subpack',
  DepthAnythingV2Preprocessor: 'ComfyUI ControlNet Auxiliary Preprocessors',
  DownloadAndLoadDepthAnythingV2Model: 'ComfyUI-DepthAnythingV2',
  DepthAnything_V2: 'ComfyUI-DepthAnythingV2',
};

let cachedObjectInfo: Record<string, ComfyObjectInfoInputSpec> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchComfyJson<T>(endpoint: string, init?: RequestInit, timeoutMs = COMFY_REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getComfyBaseUrl()}${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `ComfyUI request failed with status ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchComfyBinary(endpoint: string, timeoutMs = COMFY_REQUEST_TIMEOUT_MS): Promise<{
  mimeType: string;
  buffer: Buffer;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getComfyBaseUrl()}${endpoint}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `ComfyUI image request failed with status ${response.status}.`);
    }

    const mimeType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    return {
      mimeType,
      buffer: Buffer.from(arrayBuffer),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchComfyUploadJson<T>(endpoint: string, formData: FormData, timeoutMs = COMFY_REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getComfyBaseUrl()}${endpoint}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `ComfyUI upload failed with status ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function ensureWorkflowGraph(value: unknown): WorkflowGraph {
  if (!value || typeof value !== 'object') {
    throw new Error('Workflow JSON is invalid.');
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.nodes) || !Array.isArray(record.links)) {
    throw new Error('Workflow JSON is missing nodes/links.');
  }

  return {
    ...record,
    last_node_id: typeof record.last_node_id === 'number' ? record.last_node_id : 0,
    last_link_id: typeof record.last_link_id === 'number' ? record.last_link_id : 0,
    nodes: record.nodes as WorkflowNode[],
    links: record.links as WorkflowLink[],
  };
}

async function readWorkflow(kind: 'sprite' | 'cg'): Promise<WorkflowGraph> {
  const workflowPath = kind === 'cg' ? appConfig.comfyUi.cgWorkflowPath : appConfig.comfyUi.spriteWorkflowPath;
  const content = await readFile(workflowPath, 'utf8');
  return ensureWorkflowGraph(JSON.parse(content));
}

async function readOpenMouthSpriteWorkflow(): Promise<ApiPrompt> {
  const content = await readFile(appConfig.comfyUi.spriteOpenMouthWorkflowPath, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Open-mouth sprite workflow JSON is invalid.');
  }

  const prompt = parsed as ApiPrompt;
  for (const [nodeId, node] of Object.entries(prompt)) {
    if (!node || typeof node !== 'object' || typeof node.class_type !== 'string') {
      throw new Error(`Open-mouth sprite workflow node ${nodeId} is invalid.`);
    }
    if (!node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) {
      node.inputs = {};
    }
  }

  return prompt;
}

function cloneWorkflow(workflow: WorkflowGraph): WorkflowGraph {
  return JSON.parse(JSON.stringify(workflow)) as WorkflowGraph;
}

function cloneApiPrompt(prompt: ApiPrompt): ApiPrompt {
  return JSON.parse(JSON.stringify(prompt)) as ApiPrompt;
}

function findNodeByType(workflow: WorkflowGraph, nodeType: string): WorkflowNode | null {
  return workflow.nodes.find((node) => node.type === nodeType) || null;
}

function composePromptSegments(...segments: string[]): string {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const segment of segments) {
    const parts = segment
      .split(/[,\n]/g)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      values.push(part);
    }
  }

  return values.join(', ');
}

function setPositivePrompt(workflow: WorkflowGraph, prompt: string): void {
  const positivePromptNode =
    workflow.nodes.find((node) => node.type === 'CLIPTextEncode' && String(node.title || '').includes('Positive Prompt')) ||
    workflow.nodes.find((node) => node.type === 'CLIPTextEncode');

  if (!positivePromptNode) {
    throw new Error('Workflow is missing a positive prompt CLIPTextEncode node.');
  }

  const widgets = Array.isArray(positivePromptNode.widgets_values) ? [...positivePromptNode.widgets_values] : [];
  widgets[0] = prompt;
  positivePromptNode.widgets_values = widgets;
}

function findNegativePromptNode(workflow: WorkflowGraph): WorkflowNode | null {
  const clipNodes = workflow.nodes.filter((node) => node.type === 'CLIPTextEncode');
  if (clipNodes.length === 0) {
    return null;
  }

  const explicitNegative = clipNodes.find((node) => String(node.title || '').includes('Negative Prompt'));
  if (explicitNegative) {
    return explicitNegative;
  }

  const nonPositive = clipNodes.find((node) => !String(node.title || '').includes('Positive Prompt'));
  if (nonPositive) {
    return nonPositive;
  }

  return clipNodes[1] || null;
}

function appendNegativePrompt(workflow: WorkflowGraph, appendedPrompt: string): void {
  const negativePromptNode = findNegativePromptNode(workflow);
  if (!negativePromptNode) {
    return;
  }

  const widgets = Array.isArray(negativePromptNode.widgets_values) ? [...negativePromptNode.widgets_values] : [];
  const existingPrompt = typeof widgets[0] === 'string' ? widgets[0] : '';
  widgets[0] = composePromptSegments(existingPrompt, appendedPrompt);
  negativePromptNode.widgets_values = widgets;
}

function setFaceDetailerSteps(workflow: WorkflowGraph, steps: number): void {
  for (const node of workflow.nodes) {
    if (node.type !== 'FaceDetailer') {
      continue;
    }

    const widgetValues = Array.isArray(node.widgets_values) ? [...node.widgets_values] : [];
    if (widgetValues.length === 0) {
      continue;
    }

    const hasControlAfterSeed = typeof widgetValues[4] === 'string' && K_SAMPLER_CONTROL_MODES.has(widgetValues[4]);
    const stepsIndex = hasControlAfterSeed ? 5 : 4;
    if (stepsIndex >= 0 && stepsIndex < widgetValues.length) {
      widgetValues[stepsIndex] = Math.max(1, Math.round(steps));
      node.widgets_values = widgetValues;
    }
  }
}

function setUltralyticsDetectorModel(workflow: WorkflowGraph, modelPath: string): void {
  for (const node of workflow.nodes) {
    if (node.type !== 'UltralyticsDetectorProvider') {
      continue;
    }

    const widgetValues = Array.isArray(node.widgets_values) ? [...node.widgets_values] : [];
    if (widgetValues.length === 0) {
      continue;
    }

    widgetValues[0] = modelPath;
    node.widgets_values = widgetValues;
  }
}

function getApiNodeTitle(node: ApiPromptNode): string {
  return typeof node._meta?.title === 'string' ? node._meta.title : '';
}

function setApiPromptText(prompt: ApiPrompt, text: string, tone: 'positive' | 'negative'): void {
  for (const node of Object.values(prompt)) {
    if (node.class_type !== 'CLIPTextEncode') {
      continue;
    }

    const title = getApiNodeTitle(node).toLowerCase();
    const isNegative = title.includes('negative');
    const shouldUpdate = tone === 'negative' ? isNegative : !isNegative;
    if (shouldUpdate) {
      node.inputs.text = text;
    }
  }
}

function setApiPromptNodeText(prompt: ApiPrompt, nodeId: string, text: string): void {
  const node = prompt[nodeId];
  if (node?.class_type === 'CLIPTextEncode') {
    node.inputs.text = text;
  }
}

function appendApiNegativePrompt(prompt: ApiPrompt, appendedPrompt: string): void {
  for (const node of Object.values(prompt)) {
    if (node.class_type !== 'CLIPTextEncode') {
      continue;
    }

    if (!getApiNodeTitle(node).toLowerCase().includes('negative')) {
      continue;
    }

    node.inputs.text = composePromptSegments(String(node.inputs.text || ''), appendedPrompt);
  }
}

function setApiCheckpoint(prompt: ApiPrompt, checkpoint: string): void {
  if (!checkpoint) {
    return;
  }

  for (const node of Object.values(prompt)) {
    if (node.class_type === 'UNETLoader') {
      node.inputs.unet_name = checkpoint;
    }
  }
}

function setApiKSamplerSteps(prompt: ApiPrompt, steps: number): void {
  const safeSteps = Math.max(1, Math.round(steps));
  for (const node of Object.values(prompt)) {
    if (node.class_type === 'KSampler') {
      node.inputs.steps = safeSteps;
    }
  }
}

function setApiUpscaleModel(prompt: ApiPrompt, upscaleModel: string): void {
  if (!upscaleModel.trim()) {
    return;
  }

  for (const node of Object.values(prompt)) {
    if (node.class_type === 'UpscaleModelLoader') {
      node.inputs.model_name = upscaleModel;
    }
  }
}

function replaceApiInputReference(prompt: ApiPrompt, fromNodeId: string, toReference: unknown): void {
  for (const node of Object.values(prompt)) {
    for (const [inputName, inputValue] of Object.entries(node.inputs)) {
      if (
        Array.isArray(inputValue) &&
        inputValue.length >= 2 &&
        String(inputValue[0]) === fromNodeId
      ) {
        node.inputs[inputName] = Array.isArray(toReference) ? [...toReference] : toReference;
      }
    }
  }
}

async function listAvailableUltralyticsDetectorInputs(): Promise<Set<string>> {
  const available = new Set<string>();

  for (const endpoint of ['/models/ultralytics', '/models/ultralytics_bbox']) {
    try {
      const listedModels = extractStringList(await fetchComfyJson<unknown>(endpoint, undefined, 5_000));
      for (const entry of listedModels) {
        const normalized = entry.replace(/\\/g, '/').trim();
        if (!normalized) {
          continue;
        }

        available.add(normalized.includes('/') ? normalized : `bbox/${normalized}`);
      }
    } catch {
      // Endpoint availability varies by ComfyUI build; continue with filesystem fallback.
    }
  }

  return available;
}

async function setApiDetectorModels(prompt: ApiPrompt): Promise<void> {
  await ensureBundledDetectorInstalled(MOUTH_DETECTOR_MODEL_NAME);

  const availableDetectorInputs = await listAvailableUltralyticsDetectorInputs();
  if (availableDetectorInputs.size > 0 && !availableDetectorInputs.has(MOUTH_DETECTOR_MODEL_INPUT)) {
    throw new Error(
      `${MOUTH_DETECTOR_MODEL_INPUT} was copied into ComfyUI/models/ultralytics/bbox, but ComfyUI still needs a restart to load it.`,
    );
  }

  for (const node of Object.values(prompt)) {
    if (node.class_type !== 'UltralyticsDetectorProvider') {
      continue;
    }

    const currentName = typeof node.inputs.model_name === 'string' ? node.inputs.model_name.toLowerCase() : '';
    node.inputs.model_name = currentName.includes('mouth')
      ? MOUTH_DETECTOR_MODEL_INPUT
      : FACE_DETECTOR_MODEL_INPUT;
  }
}

function bypassApiUpscaleStage(prompt: ApiPrompt): void {
  const removableNodeIds = new Set<string>();
  for (const [nodeId, node] of Object.entries(prompt)) {
    if (node.class_type !== 'ImageUpscaleWithModel') {
      continue;
    }

    const imageInput = node.inputs.image;
    if (!Array.isArray(imageInput)) {
      continue;
    }

    replaceApiInputReference(prompt, nodeId, imageInput);
    removableNodeIds.add(nodeId);

    const upscaleModel = node.inputs.upscale_model;
    if (Array.isArray(upscaleModel) && typeof upscaleModel[0] === 'string') {
      removableNodeIds.add(upscaleModel[0]);
    }
  }

  for (const nodeId of removableNodeIds) {
    delete prompt[nodeId];
  }
}

function applyApiLoraChain(prompt: ApiPrompt, loras: ComfyLoraSelection[]): void {
  const requestedLoras = loras.filter((entry) => entry.name.trim());
  const loraEntries = Object.entries(prompt).filter(([, node]) => node.class_type === 'LoraLoaderModelOnly');
  if (loraEntries.length === 0) {
    if (requestedLoras.length > 0) {
      throw new Error('Animated sprite workflow does not contain a LoraLoaderModelOnly node to adapt.');
    }
    return;
  }

  const [templateNodeId, templateNode] = loraEntries[0];
  const sourceModel = templateNode.inputs.model;
  if (!Array.isArray(sourceModel)) {
    throw new Error('Unable to determine animated workflow model source for LoRA chaining.');
  }

  for (const [nodeId] of loraEntries.slice(1)) {
    delete prompt[nodeId];
  }

  if (requestedLoras.length === 0) {
    replaceApiInputReference(prompt, templateNodeId, sourceModel);
    delete prompt[templateNodeId];
    return;
  }

  const usedNodeIds = Object.keys(prompt)
    .map((nodeId) => Number.parseInt(nodeId, 10))
    .filter((nodeId) => Number.isFinite(nodeId));
  let nextNodeId = Math.max(0, ...usedNodeIds);
  let previousModelRef: unknown = sourceModel;
  let tailNodeId = templateNodeId;

  requestedLoras.forEach((lora, index) => {
    const nodeId = index === 0 ? templateNodeId : String(++nextNodeId);
    const nextNode: ApiPromptNode = index === 0 ? templateNode : cloneApiPrompt({ template: templateNode }).template;
    nextNode.inputs = {
      ...nextNode.inputs,
      lora_name: lora.name,
      strength_model: lora.strength,
      model: previousModelRef,
    };
    prompt[nodeId] = nextNode;
    previousModelRef = [nodeId, 0];
    tailNodeId = nodeId;
  });

  for (const node of Object.values(prompt)) {
    if (node.class_type === 'LoraLoaderModelOnly') {
      continue;
    }

    for (const [inputName, inputValue] of Object.entries(node.inputs)) {
      if (Array.isArray(inputValue) && inputValue.length >= 2 && String(inputValue[0]) === templateNodeId) {
        node.inputs[inputName] = [tailNodeId, 0];
      }
    }
  }
}

function setKSamplerSteps(workflow: WorkflowGraph, steps: number): void {
  const safeSteps = Math.max(1, Math.round(steps));
  for (const node of workflow.nodes) {
    if (node.type !== 'KSampler') {
      continue;
    }

    const widgetValues = Array.isArray(node.widgets_values) ? [...node.widgets_values] : [];
    if (widgetValues.length === 0) {
      continue;
    }

    const hasControlAfterGenerate = typeof widgetValues[1] === 'string' && K_SAMPLER_CONTROL_MODES.has(widgetValues[1]);
    const stepsIndex = hasControlAfterGenerate ? 2 : 1;
    if (stepsIndex >= 0 && stepsIndex < widgetValues.length) {
      widgetValues[stepsIndex] = safeSteps;
      node.widgets_values = widgetValues;
    }
  }
}

function setLatentDimensions(workflow: WorkflowGraph, width: number, height: number): void {
  const safeWidth = Math.max(64, Math.round(width));
  const safeHeight = Math.max(64, Math.round(height));
  const latentNodeTypes = new Set(['EmptyLatentImage', 'EmptySD3LatentImage']);

  for (const node of workflow.nodes) {
    if (!latentNodeTypes.has(node.type)) {
      continue;
    }

    const widgetValues = Array.isArray(node.widgets_values) ? [...node.widgets_values] : [];
    if (widgetValues.length < 2) {
      continue;
    }

    widgetValues[0] = safeWidth;
    widgetValues[1] = safeHeight;
    node.widgets_values = widgetValues;
  }
}

function setCheckpoint(workflow: WorkflowGraph, checkpoint: string): void {
  if (!checkpoint) {
    return;
  }

  const unetNode = findNodeByType(workflow, 'UNETLoader');
  if (!unetNode) {
    return;
  }

  const widgets = Array.isArray(unetNode.widgets_values) ? [...unetNode.widgets_values] : [];
  widgets[0] = checkpoint;
  unetNode.widgets_values = widgets;
}

function setUpscaleModel(workflow: WorkflowGraph, upscaleModel: string): void {
  if (!upscaleModel.trim()) {
    return;
  }

  const upscaleLoaderNode = findNodeByType(workflow, 'UpscaleModelLoader');
  if (!upscaleLoaderNode) {
    throw new Error('Workflow is missing UpscaleModelLoader.');
  }

  const widgets = Array.isArray(upscaleLoaderNode.widgets_values) ? [...upscaleLoaderNode.widgets_values] : [];
  widgets[0] = upscaleModel;
  upscaleLoaderNode.widgets_values = widgets;
}

function bypassUpscaleStage(workflow: WorkflowGraph): void {
  const upscaleNode = findNodeByType(workflow, 'ImageUpscaleWithModel');
  if (!upscaleNode) {
    return;
  }

  const linksById = new Map(workflow.links.map((link) => [link[0], link]));
  const imageInputLinkId = upscaleNode.inputs?.find((entry) => entry.name === 'image')?.link;
  if (typeof imageInputLinkId !== 'number') {
    return;
  }

  const sourceLink = linksById.get(imageInputLinkId);
  if (!sourceLink) {
    return;
  }

  const outgoingLinks = workflow.links.filter((link) => link[1] === upscaleNode.id);
  const replacementLinks: WorkflowLink[] = outgoingLinks.map((link) => {
    workflow.last_link_id += 1;
    return [
      workflow.last_link_id,
      sourceLink[1],
      sourceLink[2],
      link[3],
      link[4],
      link[5] || sourceLink[5] || 'IMAGE',
    ];
  });

  const removedNodeIds = new Set<number>([upscaleNode.id]);
  for (const node of workflow.nodes) {
    if (node.type !== 'UpscaleModelLoader') {
      continue;
    }
    removedNodeIds.add(node.id);
  }

  workflow.links = workflow.links.filter(
    (link) => !removedNodeIds.has(link[1]) && !removedNodeIds.has(link[3]),
  );
  workflow.nodes = workflow.nodes.filter((node) => !removedNodeIds.has(node.id));
  workflow.links.push(...replacementLinks);
  rebuildWorkflowPorts(workflow);
}

function bypassSceneBackgroundRemovalStage(workflow: WorkflowGraph): void {
  const removableNodeTypes = new Set(['BiRefNetRMBG', 'ImageRemoveBackground', 'RembgNode']);
  const targetNodes = workflow.nodes.filter((node) => removableNodeTypes.has(node.type));
  if (targetNodes.length === 0) {
    return;
  }

  const linksById = new Map(workflow.links.map((link) => [link[0], link]));
  const removedNodeIds = new Set<number>();
  const replacementLinks: WorkflowLink[] = [];

  for (const node of targetNodes) {
    const imageInputLinkId = node.inputs?.find((entry) => entry.name === 'image')?.link;
    if (typeof imageInputLinkId !== 'number') {
      continue;
    }

    const sourceLink = linksById.get(imageInputLinkId);
    if (!sourceLink) {
      continue;
    }

    const outgoingLinks = workflow.links.filter((link) => link[1] === node.id);
    if (outgoingLinks.length === 0) {
      continue;
    }

    removedNodeIds.add(node.id);
    const replacementForNode: WorkflowLink[] = outgoingLinks.map((link) => {
      workflow.last_link_id += 1;
      return [
        workflow.last_link_id,
        sourceLink[1],
        sourceLink[2],
        link[3],
        link[4],
        link[5] || sourceLink[5] || 'IMAGE',
      ];
    });
    replacementLinks.push(...replacementForNode);
  }

  if (removedNodeIds.size === 0) {
    return;
  }

  workflow.links = workflow.links.filter((link) => !removedNodeIds.has(link[1]) && !removedNodeIds.has(link[3]));
  workflow.nodes = workflow.nodes.filter((node) => !removedNodeIds.has(node.id));
  workflow.links.push(...replacementLinks);
  rebuildWorkflowPorts(workflow);
}

function bypassFaceDetailerStage(workflow: WorkflowGraph): void {
  const targetNodes = workflow.nodes.filter((node) => node.type === 'FaceDetailer');
  if (targetNodes.length === 0) {
    return;
  }

  const linksById = new Map(workflow.links.map((link) => [link[0], link]));
  const removedNodeIds = new Set<number>();
  const replacementLinks: WorkflowLink[] = [];

  for (const node of targetNodes) {
    const imageInputLinkId = node.inputs?.find((entry) => entry.name === 'image')?.link;
    if (typeof imageInputLinkId !== 'number') {
      continue;
    }

    const sourceLink = linksById.get(imageInputLinkId);
    if (!sourceLink) {
      continue;
    }

    const outgoingLinks = workflow.links.filter((link) => link[1] === node.id);
    if (outgoingLinks.length === 0) {
      continue;
    }

    removedNodeIds.add(node.id);
    for (const link of outgoingLinks) {
      workflow.last_link_id += 1;
      replacementLinks.push([
        workflow.last_link_id,
        sourceLink[1],
        sourceLink[2],
        link[3],
        link[4],
        link[5] || sourceLink[5] || 'IMAGE',
      ]);
    }
  }

  if (removedNodeIds.size === 0) {
    return;
  }

  workflow.links = workflow.links.filter((link) => !removedNodeIds.has(link[1]) && !removedNodeIds.has(link[3]));
  workflow.nodes = workflow.nodes.filter((node) => !removedNodeIds.has(node.id));
  workflow.links.push(...replacementLinks);
  rebuildWorkflowPorts(workflow);
}

function rebuildWorkflowPorts(workflow: WorkflowGraph): void {
  const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]));

  for (const node of workflow.nodes) {
    if (Array.isArray(node.inputs)) {
      node.inputs = node.inputs.map((entry) => ({
        ...entry,
        link: null,
      }));
    }
    if (Array.isArray(node.outputs)) {
      node.outputs = node.outputs.map((entry) => ({
        ...entry,
        links: [],
      }));
    }
  }

  for (const link of workflow.links) {
    const [linkId, sourceNodeId, sourceSlot, targetNodeId, targetSlot] = link;
    const sourceNode = nodeMap.get(sourceNodeId);
    const targetNode = nodeMap.get(targetNodeId);

    if (sourceNode?.outputs && sourceNode.outputs[sourceSlot]) {
      const sourceLinks = Array.isArray(sourceNode.outputs[sourceSlot].links)
        ? sourceNode.outputs[sourceSlot].links
        : [];
      sourceNode.outputs[sourceSlot].links = [...sourceLinks, linkId];
    }

    if (targetNode?.inputs && targetNode.inputs[targetSlot]) {
      targetNode.inputs[targetSlot].link = linkId;
    }
  }

  for (const node of workflow.nodes) {
    if (Array.isArray(node.outputs)) {
      node.outputs = node.outputs.map((entry) => ({
        ...entry,
        links: Array.isArray(entry.links) && entry.links.length > 0 ? entry.links : null,
      }));
    }
  }
}

function applyLoraChain(workflow: WorkflowGraph, loras: ComfyLoraSelection[]): void {
  const requestedLoras = loras.filter((entry) => entry.name.trim());
  const loraNodes = workflow.nodes.filter((node) => node.type === 'LoraLoaderModelOnly');

  if (loraNodes.length === 0) {
    if (requestedLoras.length > 0) {
      throw new Error('Workflow does not contain a LoraLoaderModelOnly node to adapt.');
    }
    return;
  }

  const loraNodeIds = new Set(loraNodes.map((node) => node.id));
  const linkById = new Map(workflow.links.map((link) => [link[0], link]));
  const sourceLink = loraNodes
    .map((node) => {
      const modelInput = node.inputs?.find((input) => input.name === 'model');
      if (typeof modelInput?.link !== 'number') {
        return null;
      }
      return linkById.get(modelInput.link) || null;
    })
    .find((link) => Boolean(link && !loraNodeIds.has(link[1])));

  if (!sourceLink) {
    throw new Error('Unable to determine the model source link for LoRA chaining.');
  }

  const sourceNodeId = sourceLink[1];
  const sourceOutputSlot = sourceLink[2];
  const sourceLinkType = sourceLink[5] || 'MODEL';
  const consumerLinks = workflow.links.filter(
    (link) => loraNodeIds.has(link[1]) && !loraNodeIds.has(link[3]),
  );
  const templateNode = loraNodes[0];

  workflow.nodes = workflow.nodes.filter((node) => !loraNodeIds.has(node.id));
  workflow.links = workflow.links.filter((link) => !loraNodeIds.has(link[1]) && !loraNodeIds.has(link[3]));

  const createLink = (
    originNodeId: number,
    originSlot: number,
    targetNodeId: number,
    targetSlot: number,
    type: string,
  ): WorkflowLink => {
    workflow.last_link_id += 1;
    return [workflow.last_link_id, originNodeId, originSlot, targetNodeId, targetSlot, type];
  };

  if (requestedLoras.length === 0) {
    workflow.links.push(
      ...consumerLinks.map((consumer) =>
        createLink(sourceNodeId, sourceOutputSlot, consumer[3], consumer[4], consumer[5] || sourceLinkType),
      ),
    );
    rebuildWorkflowPorts(workflow);
    return;
  }

  const createdNodeIds: number[] = [];
  for (let index = 0; index < requestedLoras.length; index += 1) {
    const lora = requestedLoras[index];
    workflow.last_node_id += 1;

    const nextNodeId = workflow.last_node_id;
    const clonedNode: WorkflowNode = {
      ...templateNode,
      id: nextNodeId,
      pos: Array.isArray(templateNode.pos)
        ? [templateNode.pos[0] + index * 260, templateNode.pos[1]]
        : templateNode.pos,
      inputs: Array.isArray(templateNode.inputs)
        ? templateNode.inputs.map((input) => ({
            ...input,
            link: null,
          }))
        : [],
      outputs: Array.isArray(templateNode.outputs)
        ? templateNode.outputs.map((output) => ({
            ...output,
            links: null,
          }))
        : [],
      widgets_values: [lora.name, lora.strength],
    };

    workflow.nodes.push(clonedNode);
    createdNodeIds.push(nextNodeId);
  }

  if (createdNodeIds.length > 0) {
    workflow.links.push(
      createLink(sourceNodeId, sourceOutputSlot, createdNodeIds[0], 0, sourceLinkType),
    );
  }

  for (let index = 1; index < createdNodeIds.length; index += 1) {
    workflow.links.push(
      createLink(createdNodeIds[index - 1], 0, createdNodeIds[index], 0, 'MODEL'),
    );
  }

  const tailNodeId = createdNodeIds[createdNodeIds.length - 1];
  workflow.links.push(
    ...consumerLinks.map((consumer) => createLink(tailNodeId, 0, consumer[3], consumer[4], consumer[5] || 'MODEL')),
  );

  rebuildWorkflowPorts(workflow);
}

function collectMissingNodes(
  workflow: WorkflowGraph,
  workflowKind: 'sprite' | 'cg',
  objectInfo: Record<string, ComfyObjectInfoInputSpec>,
): ComfyMissingNode[] {
  return workflow.nodes
    .filter((node) => !objectInfo[node.type])
    .map((node) => ({
      workflowKind,
      nodeId: node.id,
      nodeType: MISSING_NODE_NAME_MAP[node.type] || node.type,
      nodeTitle: String(node.title || '').trim(),
    }));
}

function collectMissingNodesFromApiPrompt(
  prompt: ApiPrompt,
  workflowKind: 'sprite' | 'cg',
  objectInfo: Record<string, ComfyObjectInfoInputSpec>,
): ComfyMissingNode[] {
  return Object.entries(prompt)
    .filter(([, node]) => !objectInfo[node.class_type])
    .map(([nodeId, node]) => ({
      workflowKind,
      nodeId: Number.parseInt(nodeId, 10) || 0,
      nodeType: MISSING_NODE_NAME_MAP[node.class_type] || node.class_type,
      nodeTitle: getApiNodeTitle(node),
    }));
}

function formatMissingNodesMessage(missingNodes: ComfyMissingNode[]): string {
  const grouped = new Map<'sprite' | 'cg', ComfyMissingNode[]>();
  for (const node of missingNodes) {
    const current = grouped.get(node.workflowKind) || [];
    grouped.set(node.workflowKind, [...current, node]);
  }

  const sections: string[] = [];
  for (const workflowKind of ['sprite', 'cg'] as const) {
    const entries = grouped.get(workflowKind) || [];
    if (entries.length === 0) {
      continue;
    }

    const labels = entries.map((entry) => {
      const titleSuffix = entry.nodeTitle ? ` (${entry.nodeTitle})` : '';
      return `${entry.nodeType}#${entry.nodeId}${titleSuffix}`;
    });
    sections.push(`${workflowKind} workflow: ${labels.join(', ')}`);
  }

  return `Missing ComfyUI nodes detected. Install required custom nodes before generating. ${sections.join(' | ')}`.trim();
}

async function getMissingNodesForWorkflows(): Promise<ComfyMissingNode[]> {
  const objectInfo = await getComfyObjectInfo();
  const spriteWorkflow = await readWorkflow('sprite');
  return collectMissingNodes(spriteWorkflow, 'sprite', objectInfo);
}

function shouldMapWidgetValue(inputSpec: unknown[] | undefined): boolean {
  if (!Array.isArray(inputSpec) || inputSpec.length === 0) {
    return false;
  }

  const inputType = inputSpec[0];
  if (Array.isArray(inputType)) {
    return true;
  }

  if (typeof inputType !== 'string') {
    return false;
  }

  if (PRIMITIVE_INPUT_TYPES.has(inputType)) {
    return true;
  }

  return inputType === 'COMBO';
}

function getSpecDefaultValue(inputSpec: unknown[] | undefined): unknown {
  if (!Array.isArray(inputSpec) || inputSpec.length < 2) {
    return undefined;
  }

  const config = inputSpec[1];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  return (config as Record<string, unknown>).default;
}

function normalizeEnumCandidate(
  value: unknown,
  options: string[],
): { matched: boolean; value: string } {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (options.includes(trimmed)) {
      return { matched: true, value: trimmed };
    }
  }

  return {
    matched: false,
    value: options[0] || '',
  };
}

function normalizePrimitiveCandidate(
  value: unknown,
  inputType: string,
): { matched: boolean; value: unknown } {
  if (inputType === 'INT') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { matched: true, value: Math.round(value) };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+$/.test(trimmed)) {
        return { matched: true, value: Number.parseInt(trimmed, 10) };
      }
    }
    return { matched: false, value: 0 };
  }

  if (inputType === 'FLOAT') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { matched: true, value };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?(?:\d+\.?\d*|\d*\.\d+)$/.test(trimmed)) {
        return { matched: true, value: Number.parseFloat(trimmed) };
      }
    }
    return { matched: false, value: 0 };
  }

  if (inputType === 'BOOLEAN') {
    if (typeof value === 'boolean') {
      return { matched: true, value };
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return { matched: true, value: true };
      }
      if (normalized === 'false') {
        return { matched: true, value: false };
      }
    }
    return { matched: false, value: false };
  }

  if (inputType === 'STRING' || inputType === 'COMBO') {
    if (typeof value === 'string') {
      return { matched: true, value };
    }
    return { matched: false, value: '' };
  }

  return { matched: false, value };
}

function pickWidgetValueForInput(
  widgetValues: unknown[],
  widgetIndex: number,
  inputSpec: unknown[] | undefined,
): { nextIndex: number; value: unknown } {
  const rawCurrent = widgetValues[widgetIndex];
  const defaultValue = getSpecDefaultValue(inputSpec);
  if (!Array.isArray(inputSpec) || inputSpec.length === 0) {
    return {
      nextIndex: widgetIndex + 1,
      value: rawCurrent ?? defaultValue,
    };
  }

  const inputType = inputSpec[0];
  if (Array.isArray(inputType)) {
    const options = inputType.filter((entry): entry is string => typeof entry === 'string');
    const scanLimit = Math.min(widgetValues.length, widgetIndex + 8);
    for (let index = widgetIndex; index < scanLimit; index += 1) {
      const candidate = normalizeEnumCandidate(widgetValues[index], options);
      if (candidate.matched) {
        return {
          nextIndex: index + 1,
          value: candidate.value,
        };
      }
    }
    return {
      nextIndex: widgetIndex + 1,
      value: typeof defaultValue === 'string' && options.includes(defaultValue) ? defaultValue : options[0] || '',
    };
  }

  if (typeof inputType !== 'string') {
    return {
      nextIndex: widgetIndex + 1,
      value: rawCurrent ?? defaultValue,
    };
  }

  const upperType = inputType.toUpperCase();
  if (upperType === 'STRING') {
    const normalized = normalizePrimitiveCandidate(rawCurrent, upperType);
    return {
      nextIndex: widgetIndex + 1,
      value: normalized.matched ? normalized.value : (typeof defaultValue === 'string' ? defaultValue : ''),
    };
  }

  const scanLimit = Math.min(widgetValues.length, widgetIndex + 8);
  for (let index = widgetIndex; index < scanLimit; index += 1) {
    const normalized = normalizePrimitiveCandidate(widgetValues[index], upperType);
    if (normalized.matched) {
      return {
        nextIndex: index + 1,
        value: normalized.value,
      };
    }
  }

  const fallback = normalizePrimitiveCandidate(defaultValue, upperType);
  return {
    nextIndex: widgetIndex + 1,
    value: fallback.value,
  };
}

function normalizeValueForInputSpec(
  rawValue: unknown,
  inputSpec: unknown[] | undefined,
): unknown {
  const defaultValue = getSpecDefaultValue(inputSpec);
  if (!Array.isArray(inputSpec) || inputSpec.length === 0) {
    return rawValue ?? defaultValue;
  }

  const inputType = inputSpec[0];
  if (Array.isArray(inputType)) {
    const options = inputType.filter((entry): entry is string => typeof entry === 'string');
    const candidate = normalizeEnumCandidate(rawValue, options);
    if (candidate.matched) {
      return candidate.value;
    }

    if (typeof defaultValue === 'string' && options.includes(defaultValue)) {
      return defaultValue;
    }

    return options[0] || '';
  }

  if (typeof inputType !== 'string') {
    return rawValue ?? defaultValue;
  }

  const normalized = normalizePrimitiveCandidate(rawValue, inputType.toUpperCase());
  if (normalized.matched) {
    return normalized.value;
  }

  const fallback = normalizePrimitiveCandidate(defaultValue, inputType.toUpperCase());
  return fallback.value;
}

function getInputSpecMap(classInfo: ComfyObjectInfoInputSpec): Record<string, unknown[] | undefined> {
  return {
    ...(classInfo.input?.required || {}),
    ...(classInfo.input?.optional || {}),
  };
}

function getEnumOptions(inputSpec: unknown[] | undefined): string[] {
  if (!Array.isArray(inputSpec) || inputSpec.length === 0) {
    return [];
  }

  const firstValue = inputSpec[0];
  if (!Array.isArray(firstValue)) {
    return [];
  }

  return firstValue
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function asIntegerOrFallback(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asFloatOrFallback(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function pickEnumOption(value: unknown, options: string[], fallback: string): string {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (options.includes(normalized)) {
      return normalized;
    }
  }

  return options[0] || fallback;
}

function buildKSamplerInputs(
  node: WorkflowNode,
  classInfo: ComfyObjectInfoInputSpec,
  nodeInputs: Map<string, number | null>,
  linkById: Map<number, WorkflowLink>,
): Record<string, unknown> {
  const inputSpecMap = getInputSpecMap(classInfo);
  const samplerOptions = getEnumOptions(inputSpecMap.sampler_name);
  const schedulerOptions = getEnumOptions(inputSpecMap.scheduler);
  const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  const hasControlAfterGenerate =
    typeof widgetValues[1] === 'string' && K_SAMPLER_CONTROL_MODES.has(widgetValues[1]);

  const stepsIndex = hasControlAfterGenerate ? 2 : 1;
  const cfgIndex = stepsIndex + 1;
  const firstOptionIndex = cfgIndex + 1;
  const secondOptionIndex = cfgIndex + 2;
  const denoiseIndex = cfgIndex + 3;

  const firstOptionValue = widgetValues[firstOptionIndex];
  const secondOptionValue = widgetValues[secondOptionIndex];
  const firstMatchesSampler = typeof firstOptionValue === 'string' && samplerOptions.includes(firstOptionValue.trim());
  const firstMatchesScheduler = typeof firstOptionValue === 'string' && schedulerOptions.includes(firstOptionValue.trim());
  const secondMatchesSampler = typeof secondOptionValue === 'string' && samplerOptions.includes(secondOptionValue.trim());
  const secondMatchesScheduler = typeof secondOptionValue === 'string' && schedulerOptions.includes(secondOptionValue.trim());
  const shouldSwapSamplerScheduler = firstMatchesScheduler && secondMatchesSampler && !firstMatchesSampler;

  const rawSamplerValue = shouldSwapSamplerScheduler ? secondOptionValue : firstOptionValue;
  const rawSchedulerValue = shouldSwapSamplerScheduler ? firstOptionValue : secondOptionValue;
  const inputs: Record<string, unknown> = {};

  for (const [inputName, linkId] of nodeInputs) {
    if (typeof linkId !== 'number') {
      continue;
    }

    const link = linkById.get(linkId);
    if (!link) {
      continue;
    }

    inputs[inputName] = [String(link[1]), link[2]];
  }

  inputs.seed = asIntegerOrFallback(widgetValues[0], 0);
  inputs.steps = asIntegerOrFallback(widgetValues[stepsIndex], 20);
  inputs.cfg = asFloatOrFallback(widgetValues[cfgIndex], 5.0);
  inputs.sampler_name = pickEnumOption(rawSamplerValue, samplerOptions, 'euler_ancestral');
  inputs.scheduler = pickEnumOption(rawSchedulerValue, schedulerOptions, 'simple');
  inputs.denoise = asFloatOrFallback(widgetValues[denoiseIndex], 1);

  return inputs;
}

function buildFaceDetailerInputs(
  node: WorkflowNode,
  classInfo: ComfyObjectInfoInputSpec,
  nodeInputs: Map<string, number | null>,
  linkById: Map<number, WorkflowLink>,
): Record<string, unknown> {
  const inputSpecMap = getInputSpecMap(classInfo);
  const orderedInputs = [
    ...Object.entries(classInfo.input?.required || {}),
    ...Object.entries(classInfo.input?.optional || {}),
  ];
  const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  const inputs: Record<string, unknown> = {};
  const usedWidgetIndexes = new Set<number>();

  for (const [inputName, linkId] of nodeInputs) {
    if (typeof linkId !== 'number') {
      continue;
    }

    const link = linkById.get(linkId);
    if (!link) {
      continue;
    }

    inputs[inputName] = [String(link[1]), link[2]];
  }

  const hasControlAfterSeed =
    typeof widgetValues[4] === 'string' && K_SAMPLER_CONTROL_MODES.has(widgetValues[4]);
  const stepsIndex = hasControlAfterSeed ? 5 : 4;
  const cfgIndex = stepsIndex + 1;
  const firstOptionIndex = cfgIndex + 1;
  const secondOptionIndex = cfgIndex + 2;
  const denoiseIndex = cfgIndex + 3;
  const tailStartIndex = cfgIndex + 4;

  const setFromWidget = (inputName: string, widgetIndex: number): void => {
    if (widgetIndex < 0 || widgetIndex >= widgetValues.length) {
      return;
    }
    const inputSpec = inputSpecMap[inputName];
    if (!inputSpec) {
      return;
    }
    inputs[inputName] = normalizeValueForInputSpec(widgetValues[widgetIndex], inputSpec);
    usedWidgetIndexes.add(widgetIndex);
  };

  setFromWidget('guide_size', 0);
  setFromWidget('guide_size_for', 1);
  setFromWidget('max_size', 2);
  setFromWidget('seed', 3);
  if (hasControlAfterSeed) {
    usedWidgetIndexes.add(4);
  }
  setFromWidget('steps', stepsIndex);
  setFromWidget('cfg', cfgIndex);
  setFromWidget('denoise', denoiseIndex);
  setFromWidget('feather', tailStartIndex);
  setFromWidget('noise_mask', tailStartIndex + 1);
  setFromWidget('force_inpaint', tailStartIndex + 2);
  setFromWidget('bbox_threshold', tailStartIndex + 3);
  setFromWidget('bbox_dilation', tailStartIndex + 4);
  setFromWidget('bbox_crop_factor', tailStartIndex + 5);
  setFromWidget('sam_detection_hint', tailStartIndex + 6);
  setFromWidget('sam_dilation', tailStartIndex + 7);
  setFromWidget('sam_threshold', tailStartIndex + 8);
  setFromWidget('sam_bbox_expansion', tailStartIndex + 9);
  setFromWidget('sam_mask_hint_threshold', tailStartIndex + 10);
  setFromWidget('sam_mask_hint_use_negative', tailStartIndex + 11);
  setFromWidget('drop_size', tailStartIndex + 12);
  setFromWidget('wildcard', tailStartIndex + 13);
  setFromWidget('cycle', tailStartIndex + 14);
  setFromWidget('inpaint_model', tailStartIndex + 15);
  setFromWidget('noise_mask_feather', tailStartIndex + 16);

  const samplerOptions = getEnumOptions(inputSpecMap.sampler_name);
  const schedulerOptions = getEnumOptions(inputSpecMap.scheduler);
  const firstOptionValue = widgetValues[firstOptionIndex];
  const secondOptionValue = widgetValues[secondOptionIndex];
  const firstMatchesSampler = typeof firstOptionValue === 'string' && samplerOptions.includes(firstOptionValue.trim());
  const firstMatchesScheduler = typeof firstOptionValue === 'string' && schedulerOptions.includes(firstOptionValue.trim());
  const secondMatchesSampler = typeof secondOptionValue === 'string' && samplerOptions.includes(secondOptionValue.trim());
  const shouldSwapSamplerScheduler = firstMatchesScheduler && secondMatchesSampler && !firstMatchesSampler;
  const rawSamplerValue = shouldSwapSamplerScheduler ? secondOptionValue : firstOptionValue;
  const rawSchedulerValue = shouldSwapSamplerScheduler ? firstOptionValue : secondOptionValue;

  if (inputSpecMap.sampler_name) {
    inputs.sampler_name = normalizeValueForInputSpec(rawSamplerValue, inputSpecMap.sampler_name);
    usedWidgetIndexes.add(firstOptionIndex);
    usedWidgetIndexes.add(secondOptionIndex);
  }

  if (inputSpecMap.scheduler) {
    inputs.scheduler = normalizeValueForInputSpec(rawSchedulerValue, inputSpecMap.scheduler);
    usedWidgetIndexes.add(firstOptionIndex);
    usedWidgetIndexes.add(secondOptionIndex);
  }

  const remainingWidgetValues = widgetValues
    .map((value, index) => ({ value, index }))
    .filter((entry) => !usedWidgetIndexes.has(entry.index));
  const remainingValues = remainingWidgetValues.map((entry) => entry.value);
  let remainingWidgetIndex = 0;

  for (const [inputName, inputSpec] of orderedInputs) {
    if (inputName in inputs) {
      continue;
    }

    const linkId = nodeInputs.get(inputName);
    if (typeof linkId === 'number') {
      continue;
    }

    if (!shouldMapWidgetValue(inputSpec)) {
      continue;
    }

    if (remainingWidgetIndex >= remainingWidgetValues.length) {
      break;
    }

    const picked = pickWidgetValueForInput(remainingValues, remainingWidgetIndex, inputSpec);
    inputs[inputName] = normalizeValueForInputSpec(picked.value, inputSpec);
    remainingWidgetIndex = picked.nextIndex;
  }

  return inputs;
}

function buildUltralyticsDetectorProviderInputs(
  node: WorkflowNode,
  classInfo: ComfyObjectInfoInputSpec,
  nodeInputs: Map<string, number | null>,
  linkById: Map<number, WorkflowLink>,
): Record<string, unknown> {
  const orderedInputs = [
    ...Object.entries(classInfo.input?.required || {}),
    ...Object.entries(classInfo.input?.optional || {}),
  ];
  const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  const inputs: Record<string, unknown> = {};
  let widgetIndex = 0;

  for (const [inputName, linkId] of nodeInputs) {
    if (typeof linkId !== 'number') {
      continue;
    }

    const link = linkById.get(linkId);
    if (!link) {
      continue;
    }

    inputs[inputName] = [String(link[1]), link[2]];
  }

  for (const [inputName, inputSpec] of orderedInputs) {
    if (inputName in inputs) {
      continue;
    }

    const linkId = nodeInputs.get(inputName);
    if (typeof linkId === 'number') {
      continue;
    }

    if (!shouldMapWidgetValue(inputSpec)) {
      continue;
    }

    if (widgetIndex >= widgetValues.length) {
      inputs[inputName] = getSpecDefaultValue(inputSpec);
      continue;
    }

    inputs[inputName] = widgetValues[widgetIndex];
    widgetIndex += 1;
  }

  return inputs;
}

function toPromptFormat(
  workflow: WorkflowGraph,
  objectInfo: Record<string, ComfyObjectInfoInputSpec>,
): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const linkById = new Map(workflow.links.map((link) => [link[0], link]));
  const prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {};

  for (const node of workflow.nodes) {
    const classInfo = objectInfo[node.type];
    if (!classInfo) {
      continue;
    }

    const nodeInputs = new Map(
      (Array.isArray(node.inputs) ? node.inputs : [])
        .filter((input): input is WorkflowNodePort & { link: number | null } => typeof input.name === 'string')
        .map((input) => [input.name, typeof input.link === 'number' ? input.link : null]),
    );
    const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    let widgetIndex = 0;
    let inputs: Record<string, unknown> = {};

    if (node.type === 'KSampler') {
      inputs = buildKSamplerInputs(node, classInfo, nodeInputs, linkById);
      prompt[String(node.id)] = {
        class_type: node.type,
        inputs,
      };
      continue;
    }

    if (node.type === 'FaceDetailer') {
      inputs = buildFaceDetailerInputs(node, classInfo, nodeInputs, linkById);
      prompt[String(node.id)] = {
        class_type: node.type,
        inputs,
      };
      continue;
    }

    if (node.type === 'UltralyticsDetectorProvider') {
      inputs = buildUltralyticsDetectorProviderInputs(node, classInfo, nodeInputs, linkById);
      prompt[String(node.id)] = {
        class_type: node.type,
        inputs,
      };
      continue;
    }

    const orderedInputs = [
      ...Object.entries(classInfo.input?.required || {}),
      ...Object.entries(classInfo.input?.optional || {}),
    ];

    for (const [inputName, inputSpec] of orderedInputs) {
      const linkId = nodeInputs.get(inputName);
      if (typeof linkId === 'number') {
        const link = linkById.get(linkId);
        if (!link) {
          continue;
        }

        inputs[inputName] = [String(link[1]), link[2]];
        continue;
      }

      if (!shouldMapWidgetValue(inputSpec)) {
        continue;
      }

      if (widgetIndex >= widgetValues.length) {
        continue;
      }

      const pickedWidgetValue = pickWidgetValueForInput(widgetValues, widgetIndex, inputSpec);
      inputs[inputName] = pickedWidgetValue.value;
      widgetIndex = pickedWidgetValue.nextIndex;
    }

    prompt[String(node.id)] = {
      class_type: node.type,
      inputs,
    };
  }

  return prompt;
}

function randomizePromptSeeds(
  prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>,
): void {
  for (const node of Object.values(prompt)) {
    if (typeof node.inputs.seed === 'number' && Number.isFinite(node.inputs.seed)) {
      node.inputs.seed = randomInt(0, 2_147_483_647);
    }
  }
}

async function getComfyObjectInfo(): Promise<Record<string, ComfyObjectInfoInputSpec>> {
  if (cachedObjectInfo) {
    return cachedObjectInfo;
  }

  const objectInfo = await fetchComfyJson<Record<string, ComfyObjectInfoInputSpec>>('/object_info');
  cachedObjectInfo = objectInfo;
  return objectInfo;
}

function extractStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.models)) {
      return extractStringList(record.models);
    }
    if (Array.isArray(record.files)) {
      return extractStringList(record.files);
    }
  }

  return [];
}

function defaultModelCandidatesFromWorkflow(workflow: WorkflowGraph, nodeType: string): string[] {
  const node = findNodeByType(workflow, nodeType);
  const widgets = Array.isArray(node?.widgets_values) ? node.widgets_values : [];
  const firstWidget = typeof widgets[0] === 'string' ? widgets[0].trim() : '';
  if (!firstWidget) {
    return [];
  }
  return [firstWidget];
}

function sanitizeLabel(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return 'jpg';
  }
  if (normalized === 'image/webp') {
    return 'webp';
  }
  return 'png';
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function looksLikeAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value);
}

function collectPathsFromUnknown(value: unknown, result: Set<string>): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && looksLikeAbsolutePath(trimmed)) {
      result.add(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromUnknown(entry, result);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectPathsFromUnknown(entry, result);
    }
  }
}

async function resolveComfyModelRoots(): Promise<string[]> {
  const candidates = new Set<string>();

  if (appConfig.comfyUi.modelsPath.trim()) {
    candidates.add(path.resolve(appConfig.comfyUi.modelsPath.trim()));
  }

  for (const fallbackPath of [
    path.resolve(process.cwd(), 'ComfyUI', 'models'),
    path.resolve(process.cwd(), '..', 'ComfyUI', 'models'),
    path.resolve(process.cwd(), '..', '..', 'ComfyUI', 'models'),
  ]) {
    candidates.add(fallbackPath);
  }

  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFile('powershell', [
        '-NoProfile',
        '-Command',
        "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python(w)?\\.exe$' -and ($_.CommandLine -match 'ComfyUI\\\\main.py' -or $_.CommandLine -match 'ComfyUI/main.py') } | Select-Object -ExpandProperty ExecutablePath",
      ]);
      const executablePaths = stdout
        .split(/\r?\n/g)
        .map((entry) => entry.trim())
        .filter(Boolean);

      for (const executablePath of executablePaths) {
        const portableRoot = path.dirname(path.dirname(path.resolve(executablePath)));
        if (/^[a-z]:\\windows(\\|$)/i.test(portableRoot)) {
          continue;
        }

        candidates.add(path.join(portableRoot, 'ComfyUI', 'models'));
        candidates.add(path.join(portableRoot, 'models'));
      }
    } catch {
      // Ignore process discovery failures and fall back to other heuristics.
    }
  }

  for (const endpoint of ['/model_folders', '/folder_paths']) {
    try {
      const payload = await fetchComfyJson<unknown>(endpoint, undefined, 5_000);
      const extracted = new Set<string>();
      collectPathsFromUnknown(payload, extracted);
      for (const maybePath of extracted) {
        const normalized = maybePath.replace(/[\\/]+$/, '');
        if (normalized.toLowerCase().endsWith(`${path.sep}models`) || normalized.toLowerCase().endsWith('/models')) {
          candidates.add(path.resolve(normalized));
          continue;
        }

        const marker = `${path.sep}models${path.sep}`;
        const lower = normalized.toLowerCase();
        const markerIndex = lower.indexOf(marker);
        if (markerIndex >= 0) {
          candidates.add(path.resolve(normalized.slice(0, markerIndex + marker.length - 1)));
        }
      }
    } catch {
      // Ignore endpoint absence.
    }
  }

  return Array.from(candidates);
}

async function resolveBundledDetectorModelPath(modelName: string): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), 'backend', 'ComfyUI', 'detectors', modelName),
    path.resolve(process.cwd(), 'ComfyUI', 'detectors', modelName),
    path.resolve(process.cwd(), '..', 'ComfyUI', 'detectors', modelName),
    path.resolve(process.cwd(), '..', 'backend', 'ComfyUI', 'detectors', modelName),
    path.resolve(process.cwd(), '..', '..', 'backend', 'ComfyUI', 'detectors', modelName),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `A bundled detector is required, but ${modelName} was not found in backend/ComfyUI/detectors.`,
  );
}

async function ensureBundledDetectorInstalled(modelName: string): Promise<void> {
  const bundledPath = await resolveBundledDetectorModelPath(modelName);
  const modelRoots = await resolveComfyModelRoots();
  const fallbackRoot = await resolveExistingOrPreferredModelRoot();
  const targetRoots = Array.from(new Set([...modelRoots, fallbackRoot]));

  await Promise.all(
    targetRoots.map(async (modelRoot) => {
      const targetPath = path.join(modelRoot, 'ultralytics', 'bbox', modelName);
      if (await pathExists(targetPath)) {
        return;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(bundledPath, targetPath);
    }),
  );
}

async function resolveFaceDetectorModelPath(): Promise<string> {
  return FACE_DETECTOR_MODEL_INPUT;
}

async function downloadFileIfMissing(targetPath: string, url: string, fileName: string): Promise<void> {
  if (await pathExists(targetPath)) {
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to download ${fileName} (${response.status}).`);
    }
    const content = await response.arrayBuffer();
    await writeFile(targetPath, Buffer.from(content));
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveExistingOrPreferredModelRoot(): Promise<string> {
  const modelRoots = await resolveComfyModelRoots();
  const rootExistence = await Promise.all(
    modelRoots.map(async (rootPath) => ({
      rootPath,
      exists: await pathExists(rootPath),
    })),
  );
  const preferredRoot = rootExistence.find((entry) => entry.exists)?.rootPath || modelRoots[0];
  if (!preferredRoot) {
    throw new Error('Unable to locate ComfyUI models directory. Set COMFYUI_MODELS_PATH and retry.');
  }

  return preferredRoot;
}

async function resolveComfyRootsFromModelRoots(): Promise<string[]> {
  const modelRoots = await resolveComfyModelRoots();
  return Array.from(
    new Set(
      modelRoots
        .map((modelRoot) => path.dirname(path.resolve(modelRoot)))
        .filter(Boolean),
    ),
  );
}

async function ensureDepthModels(): Promise<void> {
  const preferredModelRoot = await resolveExistingOrPreferredModelRoot();
  const vaeCandidates = VAE_MODEL_ALIASES.flatMap((modelName) => [
    path.join(preferredModelRoot, 'vae', modelName),
    path.join(preferredModelRoot, 'VAE', modelName),
  ]);

  const existingVae = await Promise.all(vaeCandidates.map(async (targetPath) => pathExists(targetPath)));
  if (!existingVae.some(Boolean)) {
    await downloadFileIfMissing(vaeCandidates[0], VAE_DOWNLOAD_URL, VAE_MODEL_NAME);
  }

  const comfyRoots = await resolveComfyRootsFromModelRoots();
  const controlNetAuxDepthCandidates = comfyRoots.map((root) =>
    path.join(
      root,
      'custom_nodes',
      'comfyui_controlnet_aux',
      'ckpts',
      'depth-anything',
      DEPTH_ANYTHING_CONTROLNET_AUX_REPO_DIR,
      DEPTH_ANYTHING_MODEL_NAME,
    ),
  );
  const depthCandidates = [
    ...controlNetAuxDepthCandidates,
    path.join(preferredModelRoot, 'depthanything', DEPTH_ANYTHING_MODEL_NAME),
  ];
  const existingDepth = await Promise.all(depthCandidates.map(async (targetPath) => pathExists(targetPath)));
  if (!existingDepth.some(Boolean)) {
    await downloadFileIfMissing(depthCandidates[0], DEPTH_ANYTHING_DOWNLOAD_URL, DEPTH_ANYTHING_MODEL_NAME);
  }
}

async function saveGeneratedImage(
  image: { buffer: Buffer; mimeType: string },
  context: {
    characterName: string;
    kind: 'sprite' | 'cg' | 'depth';
    label: string;
    variantNumber: number;
    subfolder?: string;
    suffix?: string;
  },
): Promise<{ filePath: string; fileName: string }> {
  const outputDirectory = context.subfolder
    ? path.join(appConfig.autogeneratedSpritesPath, context.subfolder)
    : appConfig.autogeneratedSpritesPath;
  await mkdir(outputDirectory, { recursive: true });
  const extension = extensionFromMimeType(image.mimeType);
  const characterSlug = sanitizeLabel(context.characterName) || 'character';
  const kindSlug = context.kind;
  const labelSlug = sanitizeLabel(context.label) || 'expression';
  const suffix = context.suffix ? `-${sanitizeLabel(context.suffix)}` : '';
  const baseName = `${characterSlug}-${kindSlug}-${labelSlug}-v${context.variantNumber}${suffix}`;

  let fileName = `${baseName}.${extension}`;
  let filePath = path.join(outputDirectory, fileName);
  let collisionIndex = 2;

  while (await pathExists(filePath)) {
    fileName = `${baseName}-${collisionIndex}.${extension}`;
    filePath = path.join(outputDirectory, fileName);
    collisionIndex += 1;
  }

  await writeFile(filePath, image.buffer);
  return { fileName, filePath };
}

function historyImages(record: unknown): GeneratedImageDescriptor[] {
  if (!record || typeof record !== 'object') {
    return [];
  }

  const outputs = (record as Record<string, unknown>).outputs;
  if (!outputs || typeof outputs !== 'object') {
    return [];
  }

  const result: GeneratedImageDescriptor[] = [];
  for (const [nodeId, nodeOutput] of Object.entries(outputs as Record<string, unknown>)) {
    if (!nodeOutput || typeof nodeOutput !== 'object') {
      continue;
    }

    const images = (nodeOutput as Record<string, unknown>).images;
    if (!Array.isArray(images) || images.length === 0) {
      continue;
    }

    const first = images[0];
    if (!first || typeof first !== 'object') {
      continue;
    }

    const imageRecord = first as Record<string, unknown>;
    const filename = typeof imageRecord.filename === 'string' ? imageRecord.filename.trim() : '';
    const subfolder = typeof imageRecord.subfolder === 'string' ? imageRecord.subfolder.trim() : '';
    const type = typeof imageRecord.type === 'string' ? imageRecord.type.trim() : 'output';

    if (filename) {
      result.push({
        nodeId,
        filename,
        subfolder,
        type: type || 'output',
      });
    }
  }

  return result;
}

function firstHistoryImage(record: unknown): { filename: string; subfolder: string; type: string } | null {
  const image = historyImages(record)[0];
  if (!image) {
    return null;
  }

  return {
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
  };
}

async function queueWorkflowPrompt(
  workflow: WorkflowGraph,
  options?: {
    afterRandomize?: (prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>) => void;
  },
): Promise<{ promptId: string }> {
  const objectInfo = await getComfyObjectInfo();
  const prompt = toPromptFormat(workflow, objectInfo);
  randomizePromptSeeds(prompt);
  options?.afterRandomize?.(prompt);

  const queued = await fetchComfyJson<{ prompt_id?: string | number }>('/prompt', {
    method: 'POST',
    body: JSON.stringify({
      client_id: randomUUID(),
      prompt,
    }),
  });

  const promptId =
    typeof queued.prompt_id === 'string'
      ? queued.prompt_id
      : typeof queued.prompt_id === 'number'
        ? String(queued.prompt_id)
        : '';
  if (!promptId) {
    throw new Error('ComfyUI did not return a prompt id.');
  }

  return { promptId };
}

async function queueApiPrompt(
  prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>,
  options?: {
    afterRandomize?: (prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>) => void;
  },
): Promise<{ promptId: string }> {
  randomizePromptSeeds(prompt);
  options?.afterRandomize?.(prompt);

  const queued = await fetchComfyJson<{ prompt_id?: string | number }>('/prompt', {
    method: 'POST',
    body: JSON.stringify({
      client_id: randomUUID(),
      prompt,
    }),
  });

  const promptId =
    typeof queued.prompt_id === 'string'
      ? queued.prompt_id
      : typeof queued.prompt_id === 'number'
        ? String(queued.prompt_id)
        : '';
  if (!promptId) {
    throw new Error('ComfyUI did not return a prompt id.');
  }

  return { promptId };
}

function imageExtensionFromMimeType(mimeType: string): string {
  const extension = extensionFromMimeType(mimeType);
  return extension === 'jpg' ? 'jpg' : extension;
}

function parseImageDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Generated image data URL is invalid.');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

async function uploadImageDataUrlToComfy(dataUrl: string, fileNamePrefix: string): Promise<string> {
  const parsed = parseImageDataUrl(dataUrl);
  const extension = imageExtensionFromMimeType(parsed.mimeType);
  const fileName = `${sanitizeLabel(fileNamePrefix) || 'pettangatari-depth-source'}-${randomUUID()}.${extension}`;
  const formData = new FormData();
  const uploadBytes = new Uint8Array(parsed.buffer);
  formData.set('image', new Blob([uploadBytes], { type: parsed.mimeType }), fileName);
  formData.set('overwrite', 'true');

  const uploaded = await fetchComfyUploadJson<{
    name?: string;
    subfolder?: string;
    type?: string;
  }>('/upload/image', formData, 60_000);

  const name = typeof uploaded.name === 'string' && uploaded.name.trim() ? uploaded.name.trim() : fileName;
  const subfolder = typeof uploaded.subfolder === 'string' && uploaded.subfolder.trim() ? uploaded.subfolder.trim() : '';
  return subfolder ? `${subfolder}/${name}` : name;
}

function getDepthNodeClass(objectInfo: Record<string, ComfyObjectInfoInputSpec>): 'aux' | 'kijai' | null {
  if (objectInfo.DepthAnythingV2Preprocessor) {
    return 'aux';
  }

  if (objectInfo.DownloadAndLoadDepthAnythingV2Model && objectInfo.DepthAnything_V2) {
    return 'kijai';
  }

  return null;
}

function setInputIfSupported(
  inputs: Record<string, unknown>,
  classInfo: ComfyObjectInfoInputSpec | undefined,
  inputName: string,
  value: unknown,
): void {
  if (!classInfo) {
    return;
  }

  const inputSpec = getInputSpecMap(classInfo)[inputName];
  if (!inputSpec) {
    return;
  }

  inputs[inputName] = normalizeValueForInputSpec(value, inputSpec);
}

function buildDepthMapPrompt(
  sourceImageName: string,
  objectInfo: Record<string, ComfyObjectInfoInputSpec>,
): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const depthNodeClass = getDepthNodeClass(objectInfo);
  if (!depthNodeClass) {
    throw new Error(
      'ComfyUI is missing a Depth Anything V2 node. Install comfyui_controlnet_aux or ComfyUI-DepthAnythingV2, then restart ComfyUI.',
    );
  }

  if (depthNodeClass === 'aux') {
    const classInfo = objectInfo.DepthAnythingV2Preprocessor;
    const depthInputs: Record<string, unknown> = {
      image: ['1', 0],
    };
    setInputIfSupported(depthInputs, classInfo, 'ckpt_name', DEPTH_ANYTHING_MODEL_NAME);
    setInputIfSupported(depthInputs, classInfo, 'resolution', 1024);

    return {
      '1': {
        class_type: 'LoadImage',
        inputs: {
          image: sourceImageName,
        },
      },
      '2': {
        class_type: 'DepthAnythingV2Preprocessor',
        inputs: depthInputs,
      },
      '3': {
        class_type: 'SaveImage',
        inputs: {
          images: ['2', 0],
          filename_prefix: 'Pettangatari_Depth',
        },
      },
    };
  }

  const loaderInfo = objectInfo.DownloadAndLoadDepthAnythingV2Model;
  const loaderInputs: Record<string, unknown> = {};
  setInputIfSupported(loaderInputs, loaderInfo, 'model', 'depth_anything_v2_vitg_fp32.safetensors');
  setInputIfSupported(loaderInputs, loaderInfo, 'device', 'auto');

  const processorInfo = objectInfo.DepthAnything_V2;
  const processorInputs: Record<string, unknown> = {
    image: ['1', 0],
    depth_anything_model: ['2', 0],
  };
  setInputIfSupported(processorInputs, processorInfo, 'resolution', 1024);

  return {
    '1': {
      class_type: 'LoadImage',
      inputs: {
        image: sourceImageName,
      },
    },
    '2': {
      class_type: 'DownloadAndLoadDepthAnythingV2Model',
      inputs: loaderInputs,
    },
    '3': {
      class_type: 'DepthAnything_V2',
      inputs: processorInputs,
    },
    '4': {
      class_type: 'SaveImage',
      inputs: {
        images: ['3', 0],
        filename_prefix: 'Pettangatari_Depth',
      },
    },
  };
}

async function waitForGeneratedImageDescriptor(promptId: string): Promise<{
  filename: string;
  subfolder: string;
  type: string;
}> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < COMFY_GENERATION_TIMEOUT_MS) {
    const history = await fetchComfyJson<Record<string, unknown>>(`/history/${encodeURIComponent(promptId)}`, undefined, 20_000);
    const promptHistory = history[promptId];
    const image = firstHistoryImage(promptHistory);
    if (image) {
      return image;
    }

    await sleep(COMFY_POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for ComfyUI generation output.');
}

async function waitForGeneratedImageDescriptors(
  promptId: string,
  expectedCount: number,
): Promise<GeneratedImageDescriptor[]> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < COMFY_GENERATION_TIMEOUT_MS) {
    const history = await fetchComfyJson<Record<string, unknown>>(`/history/${encodeURIComponent(promptId)}`, undefined, 20_000);
    const promptHistory = history[promptId];
    const images = historyImages(promptHistory);
    if (images.length >= expectedCount) {
      return images;
    }

    await sleep(COMFY_POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for ComfyUI generation output.');
}

function findOpenMouthSpriteDescriptor(descriptors: GeneratedImageDescriptor[]): GeneratedImageDescriptor | undefined {
  const descriptorByNodeId = new Map(descriptors.map((descriptor) => [descriptor.nodeId, descriptor]));
  return (
    descriptorByNodeId.get(OPEN_MOUTH_SPRITE_SAVE_NODE_ID) ||
    descriptors.find((descriptor) => descriptor.filename.toLowerCase().includes('openmouth'))
  );
}

async function waitForOpenMouthSpriteImageDescriptor(promptId: string): Promise<GeneratedImageDescriptor> {
  const startedAt = Date.now();
  let lastFoundCount = 0;

  while (Date.now() - startedAt < COMFY_GENERATION_TIMEOUT_MS) {
    const history = await fetchComfyJson<Record<string, unknown>>(`/history/${encodeURIComponent(promptId)}`, undefined, 20_000);
    const promptHistory = history[promptId];
    const descriptors = historyImages(promptHistory);
    const matched = findOpenMouthSpriteDescriptor(descriptors);
    if (matched) {
      return matched;
    }

    lastFoundCount = descriptors.length;
    await sleep(COMFY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Open-mouth sprite workflow finished without the expected SaveImage output. Found ${lastFoundCount} image output(s).`,
  );
}

function buildViewEndpoint(descriptor: { filename: string; subfolder: string; type: string }): string {
  const params = new URLSearchParams();
  params.set('filename', descriptor.filename);
  params.set('subfolder', descriptor.subfolder);
  params.set('type', descriptor.type || 'output');
  return `/view?${params.toString()}`;
}

export async function getComfyStatus(): Promise<ComfyStatus> {
  const baseUrl = getComfyBaseUrl();

  for (const endpoint of COMFY_PING_ENDPOINTS) {
    try {
      await fetchComfyJson<unknown>(endpoint, undefined, 5_000);
      return {
        baseUrl,
        online: true,
      };
    } catch {
      // try next endpoint
    }
  }

  return {
    baseUrl,
    online: false,
    error: 'ComfyUI is unreachable.',
  };
}

export async function getComfyGenerationOptions(): Promise<ComfyGenerationOptions> {
  const status = await getComfyStatus();
  const spriteWorkflow = await readWorkflow('sprite');
  const fallbackCheckpoints = defaultModelCandidatesFromWorkflow(spriteWorkflow, 'UNETLoader');
  const fallbackLoras = defaultModelCandidatesFromWorkflow(spriteWorkflow, 'LoraLoaderModelOnly');

  if (!status.online) {
    return {
      ...status,
      checkpoints: fallbackCheckpoints,
      loras: fallbackLoras,
      upscaleModels: [],
      defaultCheckpoint: fallbackCheckpoints[0] || '',
      missingNodes: [],
    };
  }

  const missingNodes = await getMissingNodesForWorkflows();

  const results: Array<[typeof COMFY_MODEL_ENDPOINTS[number]['key'], string[]]> = await Promise.all(
    COMFY_MODEL_ENDPOINTS.map(async (modelEndpoint) => {
      try {
        const raw = await fetchComfyJson<unknown>(modelEndpoint.endpoint);
        return [modelEndpoint.key, extractStringList(raw)];
      } catch {
        return [modelEndpoint.key, []];
      }
    }),
  );

  const checkpoints = results.find(([key]) => key === 'checkpoints')?.[1] || [];
  const loras = results.find(([key]) => key === 'loras')?.[1] || [];
  const upscaleModels = results.find(([key]) => key === 'upscaleModels')?.[1] || [];
  const mergedCheckpoints = checkpoints.length > 0 ? checkpoints : fallbackCheckpoints;
  const mergedLoras = loras.length > 0 ? loras : fallbackLoras;

  return {
    ...status,
    checkpoints: mergedCheckpoints,
    loras: mergedLoras,
    upscaleModels,
    defaultCheckpoint: mergedCheckpoints[0] || '',
    missingNodes,
  };
}

async function generateDepthMapForImage(
  imageDataUrl: string,
  context: {
    characterName: string;
    label: string;
    variantNumber: number;
  },
): Promise<ComfyGeneratedImage> {
  const objectInfo = await getComfyObjectInfo();
  if (!getDepthNodeClass(objectInfo)) {
    throw new Error(
      'ComfyUI is missing a Depth Anything V2 node. Install comfyui_controlnet_aux or ComfyUI-DepthAnythingV2, then restart ComfyUI.',
    );
  }

  await ensureDepthModels();
  const sourceImageName = await uploadImageDataUrlToComfy(
    imageDataUrl,
    `${context.characterName}-${context.label}-depth-source-v${context.variantNumber}`,
  );
  const prompt = buildDepthMapPrompt(sourceImageName, objectInfo);
  const queued = await queueApiPrompt(prompt);
  const imageDescriptor = await waitForGeneratedImageDescriptor(queued.promptId);
  const imageBinary = await fetchComfyBinary(buildViewEndpoint(imageDescriptor), 40_000);
  const saved = await saveGeneratedImage(imageBinary, {
    characterName: context.characterName,
    kind: 'depth',
    label: context.label,
    variantNumber: context.variantNumber,
  });

  return {
    dataUrl: `data:${imageBinary.mimeType};base64,${imageBinary.buffer.toString('base64')}`,
    fileName: saved.fileName,
    filePath: saved.filePath,
    mimeType: imageBinary.mimeType,
  };
}

export async function generateComfyDepthMapAndSave(request: {
  imageDataUrl: string;
  characterName: string;
  label: string;
  variantNumber: number;
}): Promise<ComfyGeneratedImage> {
  const status = await getComfyStatus();
  if (!status.online) {
    throw new Error('ComfyUI unavailable.');
  }

  return generateDepthMapForImage(request.imageDataUrl, {
    characterName: request.characterName,
    label: request.label,
    variantNumber: request.variantNumber,
  });
}

async function fetchAndSaveGeneratedDescriptor(
  descriptor: { filename: string; subfolder: string; type: string },
  context: {
    characterName: string;
    kind: 'sprite' | 'cg' | 'depth';
    label: string;
    variantNumber: number;
    subfolder?: string;
    suffix?: string;
  },
): Promise<ComfyGeneratedImage> {
  const imageBinary = await fetchComfyBinary(buildViewEndpoint(descriptor), 40_000);
  const saved = await saveGeneratedImage(imageBinary, context);
  return {
    dataUrl: `data:${imageBinary.mimeType};base64,${imageBinary.buffer.toString('base64')}`,
    fileName: saved.fileName,
    filePath: saved.filePath,
    mimeType: imageBinary.mimeType,
  };
}

async function generateOpenMouthSpriteFrameAndSave(
  request: ComfyImageGenerationRequest,
  options: { openMouthPrompt: string; seed?: number },
): Promise<ComfyGeneratedImage> {
  const prompt = cloneApiPrompt(await readOpenMouthSpriteWorkflow());
  setApiPromptNodeText(prompt, OPEN_MOUTH_SPRITE_BASE_PROMPT_NODE_ID, request.prompt);
  setApiPromptNodeText(prompt, OPEN_MOUTH_SPRITE_MOUTH_PROMPT_NODE_ID, options.openMouthPrompt);
  if (request.negativePrompt?.trim()) {
    appendApiNegativePrompt(prompt, request.negativePrompt.trim());
  }
  appendApiNegativePrompt(prompt, 'perspective, from above');
  setApiCheckpoint(prompt, request.checkpoint);
  setApiKSamplerSteps(prompt, request.steps ?? 30);
  await setApiDetectorModels(prompt);
  if (request.upscaleModel.trim()) {
    setApiUpscaleModel(prompt, request.upscaleModel);
  } else {
    bypassApiUpscaleStage(prompt);
  }
  applyApiLoraChain(prompt, request.loras);

  const objectInfo = await getComfyObjectInfo();
  const missingNodes = collectMissingNodesFromApiPrompt(prompt, 'sprite', objectInfo);
  if (missingNodes.length > 0) {
    throw new Error(formatMissingNodesMessage(missingNodes));
  }

  const queued = await queueApiPrompt(prompt, {
    afterRandomize: (randomizedPrompt) => {
      const baseSampler = randomizedPrompt[OPEN_MOUTH_SPRITE_BASE_SAMPLER_NODE_ID];
      const mouthSampler = randomizedPrompt[OPEN_MOUTH_SPRITE_MOUTH_SAMPLER_NODE_ID];
      if (
        baseSampler?.class_type === 'KSampler' &&
        typeof options.seed === 'number' &&
        Number.isFinite(options.seed)
      ) {
        baseSampler.inputs.seed = options.seed;
      }
      if (
        mouthSampler?.class_type === 'LanPaint_KSampler' &&
        typeof options.seed === 'number' &&
        Number.isFinite(options.seed)
      ) {
        mouthSampler.inputs.seed = options.seed;
      }
    },
  });
  const descriptor = await waitForOpenMouthSpriteImageDescriptor(queued.promptId);
  return fetchAndSaveGeneratedDescriptor(descriptor, {
    characterName: request.characterName,
    kind: 'sprite',
    label: request.label,
    variantNumber: request.variantNumber,
    subfolder: 'Animation',
    suffix: 'open-mouth',
  });
}

async function generateWorkflowImageAndSave(
  request: ComfyImageGenerationRequest,
  options?: {
    afterRandomize?: (prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>) => void;
  },
): Promise<ComfyGeneratedImage> {
  const shouldSkipFaceDetailer = request.workflowKind === 'cg' || request.skipFaceDetailer === true;
  const faceDetectorModelPath = shouldSkipFaceDetailer ? '' : await resolveFaceDetectorModelPath();
  const baseWorkflow = await readWorkflow(request.workflowKind);
  const preparedWorkflow = cloneWorkflow(baseWorkflow);
  if (shouldSkipFaceDetailer) {
    bypassFaceDetailerStage(preparedWorkflow);
  }
  if (request.skipBackgroundRemoval) {
    bypassSceneBackgroundRemovalStage(preparedWorkflow);
  }
  const objectInfo = await getComfyObjectInfo();
  const missingNodes = collectMissingNodes(preparedWorkflow, request.workflowKind, objectInfo);
  if (missingNodes.length > 0) {
    throw new Error(formatMissingNodesMessage(missingNodes));
  }
  const workflow = cloneWorkflow(preparedWorkflow);
  setPositivePrompt(workflow, request.prompt);
  if (request.negativePrompt?.trim()) {
    appendNegativePrompt(workflow, request.negativePrompt.trim());
  }
  if (request.workflowKind === 'sprite') {
    appendNegativePrompt(workflow, 'perspective, from above');
  }
  setCheckpoint(workflow, request.checkpoint);
  setKSamplerSteps(workflow, request.steps ?? 30);
  if (!shouldSkipFaceDetailer) {
    setFaceDetailerSteps(workflow, FACE_DETAILER_STEPS);
    setUltralyticsDetectorModel(workflow, faceDetectorModelPath);
  }
  if (typeof request.latentWidth === 'number' && typeof request.latentHeight === 'number') {
    setLatentDimensions(workflow, request.latentWidth, request.latentHeight);
  }
  if (request.upscaleModel.trim()) {
    setUpscaleModel(workflow, request.upscaleModel);
  } else {
    bypassUpscaleStage(workflow);
  }
  applyLoraChain(workflow, request.loras);

  const queued = await queueWorkflowPrompt(workflow, {
    afterRandomize: options?.afterRandomize,
  });
  const imageDescriptor = await waitForGeneratedImageDescriptor(queued.promptId);
  const imageBinary = await fetchComfyBinary(buildViewEndpoint(imageDescriptor), 40_000);
  const saved = await saveGeneratedImage(imageBinary, {
    characterName: request.characterName,
    kind: request.workflowKind,
    label: request.label,
    variantNumber: request.variantNumber,
  });

  const generated: ComfyGeneratedImage = {
    dataUrl: `data:${imageBinary.mimeType};base64,${imageBinary.buffer.toString('base64')}`,
    fileName: saved.fileName,
    filePath: saved.filePath,
    mimeType: imageBinary.mimeType,
  };

  if (request.generateDepthMap) {
    try {
      generated.depthMap = await generateDepthMapForImage(generated.dataUrl, {
        characterName: request.characterName,
        label: request.label,
        variantNumber: request.variantNumber,
      });
    } catch (error) {
      generated.depthMapError = error instanceof Error ? error.message : 'Depth map generation failed.';
    }
  }

  return generated;
}

export async function generateComfyImageAndSave(
  request: ComfyImageGenerationRequest,
): Promise<ComfyGeneratedImage> {
  const status = await getComfyStatus();
  if (!status.online) {
    throw new Error('ComfyUI unavailable.');
  }

  if (request.workflowKind === 'sprite' && request.generateAnimationFrames) {
    let baseSeed: number | undefined;
    const generated = await generateWorkflowImageAndSave(request, {
      afterRandomize: (randomizedPrompt) => {
        const baseSampler = randomizedPrompt['19'];
        const seed = baseSampler?.inputs.seed;
        if (
          baseSampler?.class_type === 'KSampler' &&
          typeof seed === 'number' &&
          Number.isFinite(seed)
        ) {
          baseSeed = seed;
        }
      },
    });
    const openMouthPrompt =
      request.animationFramePrompts?.openMouth?.trim() || composePromptSegments(request.prompt, 'open mouth', 'tongue');
    generated.animationFrames = {
      openMouth: await generateOpenMouthSpriteFrameAndSave(request, {
        openMouthPrompt,
        seed: baseSeed,
      }),
    };
    return generated;
  }
  return generateWorkflowImageAndSave(request);
}
