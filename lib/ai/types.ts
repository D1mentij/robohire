export type UploadData = {
  businessType: string;
  hoursPerWeek: number;
  hourlyCost: number;
  /** JPEG data URLs */
  frames: string[];
};

export const UPLOAD_STORAGE_KEY = "robohire:upload";
