export type MessageWithId = { id: number };

export function conversationBeforeMessage<T extends MessageWithId>(
  messages: T[],
  messageId: number,
) {
  const index = messages.findIndex((message) => message.id === messageId);
  return index < 0 ? null : messages.slice(0, index);
}
