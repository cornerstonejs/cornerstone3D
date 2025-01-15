/**
 * ChangeTypes defines the types of changes occurring on annotation and
 * segmentation data.
 */
enum ChangeTypes {
  /**
   * Interaction events are done when the user is actively interacting with
   * an annotation, and probably means the event shouldn't be handled/used.
   */
  Interaction = 'Interaction',
  /**
   * HandlesUpdated occurs when the handle data is added or removed, or moved around
   */
  HandlesUpdated = 'HandlesUpdated',
  /**
   * StatsUpdated occurs when the stats are updated/calculated.  This can be used
   * to ignore stats calculations changes occurring on initial load, while still
   * rendering other updates.
   */
  StatsUpdated = 'StatsUpdated',
  /**
   * InitialSetup occurs when an annotation has been created initially and
   * has the first render/data calculation being applied.
   */
  InitialSetup = 'InitialSetup',
  /**
   * Completed occurs only for the annotation completed event, just to identify it
   */
  Completed = 'Completed',
  /**
   * Occurs when an interpolation result is updated with more tool specific data.
   */
  InterpolationUpdated = 'InterpolationUpdated',
  /**
   * Occurs when an annotation is changed do to an undo or redo.
   */
  History = 'History',
  /**
   * This change type is used to identify changes where the referenced image
   * gets modified.  That may also involve changing statistics, but having
   * this as a separate type allows for updating the applicability of an annotation
   * so as to cause it to be drawn on the change, or removed if it is no longer visible.
   */
  MetadataReferenceModified = 'MetadataReferenceModified',
}

export default ChangeTypes;
