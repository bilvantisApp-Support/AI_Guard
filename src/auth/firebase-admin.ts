import * as admin from 'firebase-admin';
import { logger } from '../utils/logger';

export class FirebaseAdmin {
  private static instance: FirebaseAdmin;
  private initialized = false;

  private constructor() { }

  public static getInstance(): FirebaseAdmin {
    if (!FirebaseAdmin.instance) {
      FirebaseAdmin.instance = new FirebaseAdmin();
    }
    return FirebaseAdmin.instance;
  }

  public initialize(): void {
    if (this.initialized) {
      logger.info('Firebase Admin SDK already initialized');
      return;
    }

    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        logger.warn('Firebase configuration not found. Firebase authentication will be disabled.');
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.initialized = true;
      logger.info('Firebase Admin SDK initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin SDK:', error);
      throw error;
    }
  }

  public async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken | null> {
    if (!this.initialized) {
      logger.warn('Firebase Admin SDK not initialized');
      return null;
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      logger.error('Failed to verify Firebase ID token:', error);
      return null;
    }
  }

  public async getUser(uid: string): Promise<admin.auth.UserRecord | null> {
    if (!this.initialized) {
      logger.warn('Firebase Admin SDK not initialized');
      return null;
    }

    try {
      const userRecord = await admin.auth().getUser(uid);
      return userRecord;
    } catch (error) {
      logger.error('Failed to get Firebase user:', error);
      return null;
    }
  }

  public async createCustomToken(uid: string, claims?: object): Promise<string | null> {
    if (!this.initialized) {
      logger.warn('Firebase Admin SDK not initialized');
      return null;
    }

    try {
      const customToken = await admin.auth().createCustomToken(uid, claims);
      return customToken;
    } catch (error) {
      logger.error('Failed to create custom token:', error);
      return null;
    }
  }

  public async generatePasswordResetLink(email: string): Promise<string | null> {
    if (!this.initialized) {
      logger.warn("Firebase Admin SDK not initialized");
      return null;
    }
    try {
      const link = await admin.auth().generatePasswordResetLink(email, {
        url: `${process.env.FRONTEND_URL}/reset-password`
      });
      return link;
    } catch (error) {
      logger.error("Failed to generate password reset link:", error);
      return null;
    }
  }


  public isInitialized(): boolean {
    return this.initialized;
  }
}

export const firebaseAdmin = FirebaseAdmin.getInstance();