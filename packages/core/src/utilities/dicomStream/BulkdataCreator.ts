import { BaseDicomListener } from './BaseDicomListener';

/**
 * The bulkdata creator will listen for configured bulkdata items,
 * and will store the bulkdata information, accessible by a BulkdataUUID,
 * calling the bulkdata endpoint on the current parent listener to set the
 * value into the parent object.
 */
export class BulkdataCreator extends BaseDicomListener {}
