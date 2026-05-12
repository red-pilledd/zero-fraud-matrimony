import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

import {
  type AppSocket,
  type FrostedGlassUnlockedPayload,
  type ServerMessage,
  getSocket,
} from '../services/socket';

// ---------------------------------------------------------------------------
// Palette — Data-Driven Elegance (Navy / Slate / Gold)
// ---------------------------------------------------------------------------

const NAVY  = '#0A1628';
const SLATE = '#64748B';
const GOLD  = '#C9A84C';
const WHITE = '#F1F5F9';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A message as stored in local state (may originate from self or partner). */
interface Message {
  id: string;
  fromUserId: string;
  content: string;
  timestamp: number;
  messageCount: number;
}

/** Props passed in from App.tsx (or a navigation stack). */
export interface ChatScreenProps {
  /** The currently authenticated user. Hard-coded for dev; replace with auth context. */
  currentUserId: string;
  currentUserStake: number;
  /** The user being chatted with. */
  partnerUserId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLUR_INTENSITY = 80 as const;

/** Masks message text with block characters so layout is preserved while blurred. */
function redactContent(content: string): string {
  return content.replace(/\S/g, '█');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatScreen({
  currentUserId,
  currentUserStake,
  partnerUserId,
}: ChatScreenProps): React.JSX.Element {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [inputText, setInputText]   = useState('');
  const [messageCount, setCount]    = useState(0);
  const [isBlurred, setIsBlurred]   = useState(true);  // Frosted Glass — locked by default
  const [isConnected, setConnected] = useState(false);

  const socketRef = useRef<AppSocket | null>(null);
  const listRef   = useRef<FlatList<Message>>(null);

  // ── Socket lifecycle ──────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket(currentUserId, currentUserStake);
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Without this handler, a failed connection attempt (server unreachable,
    // wrong IP, Stake middleware rejection) fires an unhandled 'connect_error'
    // event that Expo Go surfaces as an unhandled promise rejection crash.
    socket.on('connect_error', (err: Error) => {
      console.warn('[socket] connect_error:', err.message);
      setConnected(false);
    });

    socket.on('receiveMessage', (msg: ServerMessage) => {
      setMessages(prev => [
        ...prev,
        {
          id: `${msg.timestamp}-${msg.fromUserId}`,
          fromUserId: msg.fromUserId,
          content: msg.content,
          timestamp: msg.timestamp,
          messageCount: msg.messageCount,
        },
      ]);
      setCount(msg.messageCount);
    });

    // ── Frosted Glass unlock ────────────────────────────────────────────────
    // Server emits this exactly once when messageCount reaches 15.
    // Setting isBlurred to false reveals all previously blurred messages.
    socket.on('frosted_glass_unlocked', (_payload: FrostedGlassUnlockedPayload) => {
      setIsBlurred(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('receiveMessage');
      socket.off('frosted_glass_unlocked');
    };
  }, [currentUserId, currentUserStake]);

  // ── Scroll to latest message ──────────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !socketRef.current) return;

    socketRef.current.emit('sendMessage', {
      toUserId: partnerUserId,
      content: text,
    });
    setInputText('');
  }, [inputText, partnerUserId]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isMine = item.fromUserId === currentUserId;

      return (
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubblePartner]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextPartner]}>
            {/* Redact content in place — BlurView alone isn't enough because
                the text is still selectable/accessible. Replacing with blocks
                ensures the content is unreadable at the data level too. */}
            {isBlurred ? redactContent(item.content) : item.content}
          </Text>
        </View>
      );
    },
    [currentUserId, isBlurred],
  );

  const THRESHOLD = 15;
  const progressPct = Math.min(messageCount / THRESHOLD, 1);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isBlurred ? '🔒 Frosted Glass Active' : '🔓 Photos Unlocked'}
        </Text>
        <View style={[styles.dot, { backgroundColor: isConnected ? '#22C55E' : SLATE }]} />
      </View>

      {/* ── Unlock progress bar ───────────────────────────────────────── */}
      {isBlurred && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>
            {messageCount} / {THRESHOLD} messages to unlock
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` as `${number}%` }]} />
          </View>
        </View>
      )}

      {/* ── Message list ──────────────────────────────────────────────── */}
      <View style={styles.listWrapper}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
        />

        {/* Frosted overlay — rendered on top of the list while locked */}
        {isBlurred && (
          <BlurView
            intensity={BLUR_INTENSITY}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        )}
      </View>

      {/* ── Input bar ─────────────────────────────────────────────────── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message…"
          placeholderTextColor={SLATE}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline={false}
        />
        <Pressable
          style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}
          onPress={handleSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NAVY,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: SLATE + '40',
  },
  headerTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    // backgroundColor set dynamically via inline style in JSX
  },

  // Progress bar
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  progressLabel: {
    color: SLATE,
    fontSize: 12,
    textAlign: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: SLATE + '40',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 2,
  },

  // Message list
  listWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },

  // Bubbles
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: GOLD,
    borderBottomRightRadius: 4,
  },
  bubblePartner: {
    alignSelf: 'flex-start',
    backgroundColor: SLATE + '50',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: NAVY,
    fontWeight: '500',
  },
  bubbleTextPartner: {
    color: WHITE,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: SLATE + '40',
    backgroundColor: NAVY,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: SLATE + '80',
    backgroundColor: SLATE + '20',
    color: WHITE,
    fontSize: 15,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.75,
  },
  sendButtonText: {
    color: NAVY,
    fontWeight: '700',
    fontSize: 15,
  },
});
