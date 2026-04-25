import backIcon from '../icons/arrow-left-circle.svg';
import deleteIcon from '../icons/x-circle.svg';
import menuIcon from '../icons/apps.svg';
import playIcon from '../icons/play-circle.svg';

interface PauseMenuProps {
  open: boolean;
  onResume: () => void;
  onReturnToMenu: () => void;
  onStartOver: () => void;
  onQuit: () => void;
  closeHint: string | null;
}

export function PauseMenu({
  open,
  onResume,
  onReturnToMenu,
  onStartOver,
  onQuit,
  closeHint,
}: PauseMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Pause menu">
      <div className="pause-panel">
        <h2>Paused</h2>
        <p className="pause-description">Take a breather, then jump back in or return to the studio.</p>
        <button type="button" className="action-button pause-action-button primary-action" onClick={onResume}>
          <img src={playIcon} alt="" aria-hidden="true" className="ui-icon" />
          <span>Resume</span>
        </button>
        <button type="button" className="action-button pause-action-button" onClick={onReturnToMenu}>
          <img src={menuIcon} alt="" aria-hidden="true" className="ui-icon" />
          <span>Return to main menu</span>
        </button>
        <button type="button" className="action-button pause-action-button" onClick={onStartOver}>
          <img src={backIcon} alt="" aria-hidden="true" className="ui-icon" />
          <span>Start over</span>
        </button>
        <button type="button" className="action-button pause-action-button danger" onClick={onQuit}>
          <img src={deleteIcon} alt="" aria-hidden="true" className="ui-icon" />
          <span>Quit</span>
        </button>
        {closeHint ? <p className="pause-note">{closeHint}</p> : null}
      </div>
    </div>
  );
}
