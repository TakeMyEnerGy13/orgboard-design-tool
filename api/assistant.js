import { handleAssistant } from '../assistant-api.mjs';

export default function handler(req, res) {
  return handleAssistant(req, res, `https://${req.headers.host}`);
}
