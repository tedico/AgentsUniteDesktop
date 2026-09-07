// IPC channel names, shared by main (ESM import of this CJS file) and the
// CJS preload. One place, so a typo cannot split the two sides.
module.exports = {
  EVENT: 'unite:event',
  SUBMIT: 'unite:submit',
  SKIP: 'unite:skip',
  OPEN_APP: 'unite:open-app',
  GET_SETTINGS: 'unite:get-settings',
  SET_SETTINGS: 'unite:set-settings',
  PICK_ROOT: 'unite:pick-root',
};
