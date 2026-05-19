import type {
  SignedUrlOptions,
  StorageProvider,
  StoredObject,
  UploadObjectInput,
} from "./types.js";

const encoder = new TextEncoder();

export class MockStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, Uint8Array>();

  async upload(input: UploadObjectInput): Promise<StoredObject> {
    const body = typeof input.body === "string" ? encoder.encode(input.body) : input.body;
    this.objects.set(input.key, body);

    return {
      key: input.key,
      url: `mock://storage/${input.key}`,
      contentType: input.contentType,
      sizeBytes: body.byteLength,
    };
  }

  async download(key: string): Promise<Uint8Array> {
    const object = this.objects.get(key);

    if (!object) {
      throw new Error(`Mock object not found: ${key}`);
    }

    return object;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async getSignedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const expiresInSeconds = options.expiresInSeconds ?? 300;
    return `mock://storage/${key}?expiresIn=${expiresInSeconds}`;
  }
}
