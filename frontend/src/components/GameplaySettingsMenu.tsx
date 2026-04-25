import closeIcon from '../icons/x-circle.svg';
import blurIcon from '../icons/blur.svg';
import chatIcon from '../icons/chat.svg';
import cloudRainIcon from '../icons/cloud-rain.svg';
import cursorIcon from '../icons/cursor.svg';
import fastForwardIcon from '../icons/fast-forward.svg';
import speakerIcon from '../icons/speaker.svg';
import sparklesIcon from '../icons/sparkles.svg';
import timerIcon from '../icons/timer.svg';
import { DEFAULT_GAMEPLAY_SETTINGS, type GameplaySettings } from '../gameplaySettings';

interface GameplaySettingsMenuProps {
  open: boolean;
  settings: GameplaySettings;
  onClose: () => void;
  onChange: (nextSettings: GameplaySettings) => void;
}

function SliderSetting({
  icon,
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  icon: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (nextValue: number) => void;
}) {
  return (
    <label className="settings-row settings-row-slider">
      <span className="settings-row-copy">
        <span className="settings-row-label">
          <img src={icon} alt="" aria-hidden="true" className="ui-icon" />
          <span>{label}</span>
        </span>
        <strong>{displayValue}</strong>
      </span>
      <input
        className="settings-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleSetting({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: string;
  label: string;
  checked: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <label className="settings-row settings-row-toggle">
      <span className="settings-row-label">
        <img src={icon} alt="" aria-hidden="true" className="ui-icon" />
        <span>{label}</span>
      </span>
      <span className="settings-toggle-wrap">
        <input
          className="settings-toggle-input"
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="settings-toggle" aria-hidden="true" />
      </span>
    </label>
  );
}

export function GameplaySettingsContent({
  settings,
  onChange,
}: {
  settings: GameplaySettings;
  onChange: (nextSettings: GameplaySettings) => void;
}) {
  return (
    <>
      <div className="settings-section">
        <SliderSetting
          icon={speakerIcon}
          label="BGM volume"
          value={settings.bgmVolume}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(settings.bgmVolume)}%`}
          onChange={(bgmVolume) => onChange({ ...settings, bgmVolume })}
        />
        <SliderSetting
          icon={cloudRainIcon}
          label="Ambience volume"
          value={settings.ambienceVolume}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(settings.ambienceVolume)}%`}
          onChange={(ambienceVolume) => onChange({ ...settings, ambienceVolume })}
        />
        <SliderSetting
          icon={chatIcon}
          label="Blip volume"
          value={settings.blipVolume}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(settings.blipVolume)}%`}
          onChange={(blipVolume) => onChange({ ...settings, blipVolume })}
        />
        <SliderSetting
          icon={fastForwardIcon}
          label="Blip speed"
          value={settings.blipSpeed}
          min={50}
          max={180}
          step={1}
          displayValue={`${(settings.blipSpeed / 100).toFixed(2)}x`}
          onChange={(blipSpeed) => onChange({ ...settings, blipSpeed })}
        />
        <SliderSetting
          icon={timerIcon}
          label="Text speed"
          value={settings.textSpeed}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(settings.textSpeed)}%`}
          onChange={(textSpeed) => onChange({ ...settings, textSpeed })}
        />
        <SliderSetting
          icon={blurIcon}
          label="Background dimming"
          value={settings.backgroundDimming}
          min={0}
          max={100}
          step={1}
          displayValue={`${Math.round(settings.backgroundDimming)}%`}
          onChange={(backgroundDimming) => onChange({ ...settings, backgroundDimming })}
        />
        <SliderSetting
          icon={sparklesIcon}
          label="CG/tag similarity"
          value={settings.triggerSimilarityThreshold}
          min={50}
          max={100}
          step={1}
          displayValue={`${Math.round(settings.triggerSimilarityThreshold)}%`}
          onChange={(triggerSimilarityThreshold) => onChange({ ...settings, triggerSimilarityThreshold })}
        />
        <SliderSetting
          icon={cursorIcon}
          label="Scene depth strength"
          value={settings.sceneParallaxStrength}
          min={0}
          max={200}
          step={1}
          displayValue={`${Math.round(settings.sceneParallaxStrength)}%`}
          onChange={(sceneParallaxStrength) => onChange({ ...settings, sceneParallaxStrength })}
        />
        <SliderSetting
          icon={sparklesIcon}
          label="Scene depth motion"
          value={settings.sceneDepthMotionSpeed}
          min={0}
          max={100}
          step={1}
          displayValue={settings.sceneDepthMotionSpeed <= 0 ? 'Off' : `${Math.round(settings.sceneDepthMotionSpeed)}%`}
          onChange={(sceneDepthMotionSpeed) => onChange({ ...settings, sceneDepthMotionSpeed })}
        />
        <SliderSetting
          icon={sparklesIcon}
          label="Sprite depth strength"
          value={settings.spriteParallaxStrength}
          min={0}
          max={200}
          step={1}
          displayValue={`${Math.round(settings.spriteParallaxStrength)}%`}
          onChange={(spriteParallaxStrength) => onChange({ ...settings, spriteParallaxStrength })}
        />
        <SliderSetting
          icon={blurIcon}
          label="Background blur when character is close"
          value={settings.closeBlurStrength}
          min={0}
          max={100}
          step={1}
          displayValue={settings.closeBlurStrength <= 0 ? 'Off' : `${Math.round(settings.closeBlurStrength)}%`}
          onChange={(closeBlurStrength) => onChange({ ...settings, closeBlurStrength })}
        />
      </div>

      <div className="settings-section">
        <ToggleSetting
          icon={cursorIcon}
          label="Parallax"
          checked={settings.parallaxEnabled}
          onChange={(parallaxEnabled) => onChange({ ...settings, parallaxEnabled })}
        />
        <ToggleSetting
          icon={cloudRainIcon}
          label="Weather effects"
          checked={settings.weatherEffectsEnabled}
          onChange={(weatherEffectsEnabled) => onChange({ ...settings, weatherEffectsEnabled })}
        />
        <ToggleSetting
          icon={sparklesIcon}
          label="Idle animation"
          checked={settings.idleAnimationEnabled}
          onChange={(idleAnimationEnabled) => onChange({ ...settings, idleAnimationEnabled })}
        />
        <ToggleSetting
          icon={cursorIcon}
          label="Hide interactive zones triggers"
          checked={settings.hideInteractiveZoneTriggers}
          onChange={(hideInteractiveZoneTriggers) => onChange({ ...settings, hideInteractiveZoneTriggers })}
        />
        <ToggleSetting
          icon={chatIcon}
          label="Hide Affinity Value"
          checked={settings.hideAffinityChanges}
          onChange={(hideAffinityChanges) => onChange({ ...settings, hideAffinityChanges })}
        />
        <ToggleSetting
          icon={chatIcon}
          label="Hide Lust Value"
          checked={settings.hideLustValue}
          onChange={(hideLustValue) => onChange({ ...settings, hideLustValue })}
        />
        <ToggleSetting
          icon={sparklesIcon}
          label="Debug Mode"
          checked={settings.debugMode}
          onChange={(debugMode) => onChange({ ...settings, debugMode })}
        />
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="action-button settings-reset-button"
          onClick={() => onChange({ ...DEFAULT_GAMEPLAY_SETTINGS })}
        >
          <span>Reset to default</span>
        </button>
      </div>
    </>
  );
}

export function GameplaySettingsMenu({
  open,
  settings,
  onClose,
  onChange,
}: GameplaySettingsMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Gameplay settings"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="settings-dialog">
        <div className="settings-head">
          <div>
            <h2>Session Controls</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
            data-tooltip="Close settings"
          >
            <img src={closeIcon} alt="" aria-hidden="true" className="ui-icon" />
          </button>
        </div>

        <div className="settings-scroll-area">
          <GameplaySettingsContent settings={settings} onChange={onChange} />
        </div>
      </section>
    </div>
  );
}
