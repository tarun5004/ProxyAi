import { ConversationModel } from "../../features/conversations/conversation.model.js";
import { MessageModel } from "../../features/messages/message.model.js";
import { OrganisationModel } from "../../features/organisations/organisation.model.js";
import {
    hasEncryptionKeyVersion,
    isEncryptionReady,
} from "./encryption.js";

export async function assertEncryptionStorageReady(): Promise<void> {
    const [encryptedOrganisationExists, messageVersions, titleVersions] = await Promise.all([
        OrganisationModel.exists({
            status: "ACTIVE",
            "retention.mode": "ENCRYPTED_STORAGE",
        }),
        MessageModel.distinct("contentEnc.keyVersion", { contentStored: true }),
        ConversationModel.distinct("titleEnc.keyVersion", { titleEnc: { $exists: true } }),
    ]);

    if (encryptedOrganisationExists !== null && !isEncryptionReady()) {
        throw new Error("Encrypted-storage readiness validation failed.");
    }

    for (const version of [...messageVersions, ...titleVersions]) {
        if (typeof version !== "number" || !hasEncryptionKeyVersion(version)) {
            throw new Error("Encrypted-storage readiness validation failed.");
        }
    }
}
