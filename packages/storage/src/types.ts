export type UploadObjectInput = {
  readonly key: string;
  readonly body: Uint8Array | string;
  readonly contentType?: string;
};

export type StoredObject = {
  readonly key: string;
  readonly url: string;
  readonly contentType?: string;
  readonly sizeBytes: number;
};

export type SignedUrlOptions = {
  readonly expiresInSeconds?: number;
};

export type StorageProvider = {
  upload(input: UploadObjectInput): Promise<StoredObject>;
  download(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
};
