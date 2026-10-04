/**
 * PhotoUploadSection — photo grid with modal action sheet.
 * Tap any photo → modal: "Set as Primary" | "Delete" | "Cancel"
 *
 * Requires: npx expo install expo-image-picker
 */

import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { API_BASE } from '../src/services/api';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const NAVY   = '#0A1628';
const SLATE  = '#64748B';
const GOLD   = '#C9A84C';
const WHITE  = '#F1F5F9';
const DARK   = '#152035';
const DANGER = '#EF4444';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Photo {
  id: number;
  user_id: string;
  filename: string;
  is_primary: boolean;
  sort_order: number;
  url: string;
  created_at: string;
}

interface Props { userId: string; }

const MAX_PHOTOS  = 6;
const THUMB_W     = 104;
const THUMB_H     = 138;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PhotoUploadSection({ userId }: Props) {
  const [photos, setPhotos]         = useState<Photo[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [selected, setSelected]     = useState<Photo | null>(null); // modal target
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => { fetchPhotos(); }, [userId]);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/photos/${userId}`);
      if (res.ok) setPhotos(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [userId]);

  // ── Upload ──────────────────────────────────────────────────────────────
  const handlePickPhoto = useCallback(async () => {
    if (photos.length >= MAX_PHOTOS) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
      aspect: [3, 4],
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const fetchRes = await fetch(asset.uri);
      const blob = await fetchRes.blob();
      formData.append('file', blob, asset.fileName ?? 'photo.jpg');
    } else {
      formData.append('file', {
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: asset.fileName ?? 'photo.jpg',
      } as any);
    }

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/photos/${userId}`, { method: 'POST', body: formData });
      if (res.ok) {
        const newPhoto: Photo = await res.json();
        setPhotos(prev => [...prev, newPhoto]);
      }
    } catch { /* silent */ }
    finally { setUploading(false); }
  }, [photos.length, userId]);

  // ── Set primary ─────────────────────────────────────────────────────────
  const handleSetPrimary = useCallback(async () => {
    if (!selected || selected.is_primary) { setSelected(null); return; }
    setActionBusy(true);
    try {
      const res = await fetch(`${API_BASE}/photos/${userId}/${selected.id}/primary`, { method: 'PATCH' });
      if (res.ok) {
        setPhotos(prev => prev.map(p => ({ ...p, is_primary: p.id === selected.id })));
      }
    } catch { /* silent */ }
    finally { setActionBusy(false); setSelected(null); }
  }, [selected, userId]);

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!selected) return;
    setActionBusy(true);
    try {
      const res = await fetch(`${API_BASE}/photos/${userId}/${selected.id}`, { method: 'DELETE' });
      if (res.status === 204) {
        await fetchPhotos(); // re-fetch to get updated primary
      }
    } catch { /* silent */ }
    finally { setActionBusy(false); setSelected(null); }
  }, [selected, userId, fetchPhotos]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) return <View style={s.loadingRow}><ActivityIndicator color={GOLD} /></View>;

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Photos</Text>
        <Text style={s.subtitle}>{photos.length}/{MAX_PHOTOS} · tap a photo to manage</Text>
      </View>

      {/* Grid */}
      <View style={s.grid}>
        {photos.map(photo => (
          <Pressable key={photo.id} onPress={() => setSelected(photo)} style={s.thumbWrapper}>
            <Image source={{ uri: photo.url }} style={s.thumbImage} resizeMode="cover" />
            {photo.is_primary && (
              <View style={s.primaryBadge}>
                <Text style={s.primaryBadgeText}>Primary</Text>
              </View>
            )}
          </Pressable>
        ))}

        {/* Add slot */}
        {photos.length < MAX_PHOTOS && (
          <Pressable onPress={handlePickPhoto} style={[s.thumbWrapper, s.addSlot]} disabled={uploading}>
            {uploading
              ? <ActivityIndicator color={GOLD} />
              : <><Text style={s.addIcon}>＋</Text><Text style={s.addLabel}>Add Photo</Text></>
            }
          </Pressable>
        )}
      </View>

      {/* Privacy note */}
      <Text style={s.privacyNote}>🔒 Your photos are blurred for others until 15 messages are exchanged.</Text>

      {/* ── Action modal ──────────────────────────────────────────────── */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.overlay} onPress={() => setSelected(null)}>
          <View style={s.sheet}>
            {/* Preview */}
            {selected && (
              <Image source={{ uri: selected.url }} style={s.previewImage} resizeMode="cover" />
            )}

            {selected?.is_primary && (
              <View style={s.currentPrimaryBadge}>
                <Text style={s.currentPrimaryText}>★ Current Primary Photo</Text>
              </View>
            )}

            {actionBusy ? (
              <ActivityIndicator color={GOLD} style={{ marginVertical: 20 }} />
            ) : (
              <View style={s.actions}>
                {!selected?.is_primary && (
                  <Pressable style={[s.actionBtn, s.actionBtnGold]} onPress={handleSetPrimary}>
                    <Text style={s.actionBtnGoldText}>⭐ Set as Profile Photo</Text>
                  </Pressable>
                )}
                <Pressable style={[s.actionBtn, s.actionBtnDanger]} onPress={handleDelete}>
                  <Text style={s.actionBtnDangerText}>🗑 Delete Photo</Text>
                </Pressable>
                <Pressable style={[s.actionBtn, s.actionBtnCancel]} onPress={() => setSelected(null)}>
                  <Text style={s.actionBtnCancelText}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  root:       { gap: 12 },
  loadingRow: { alignItems: 'center', paddingVertical: 20 },

  header:   { gap: 2 },
  title:    { color: GOLD, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  subtitle: { color: SLATE, fontSize: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  thumbWrapper: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SLATE + '50',
    backgroundColor: DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },

  thumbImage: {
    width: THUMB_W,
    height: THUMB_H,
  },

  primaryBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: GOLD + 'DD',
    paddingVertical: 4,
    alignItems: 'center',
  },
  primaryBadgeText: { color: NAVY, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  addSlot: {
    borderStyle: 'dashed',
    borderColor: GOLD + '60',
    gap: 4,
  },
  addIcon:  { color: GOLD, fontSize: 28, lineHeight: 32 },
  addLabel: { color: SLATE, fontSize: 11 },

  privacyNote: { color: SLATE, fontSize: 11, textAlign: 'center', paddingTop: 4 },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: DARK,
    borderRadius: 18,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: SLATE + '40',
  },
  previewImage: {
    width: '100%',
    height: 220,
  },
  currentPrimaryBadge: {
    backgroundColor: GOLD + '25',
    borderBottomWidth: 1,
    borderBottomColor: GOLD + '40',
    paddingVertical: 8,
    alignItems: 'center',
  },
  currentPrimaryText: { color: GOLD, fontSize: 12, fontWeight: '700' },

  actions: { padding: 16, gap: 10 },

  actionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnGold:       { backgroundColor: GOLD },
  actionBtnGoldText:   { color: NAVY, fontWeight: '700', fontSize: 14 },
  actionBtnDanger:     { backgroundColor: DANGER + '20', borderWidth: 1, borderColor: DANGER + '60' },
  actionBtnDangerText: { color: DANGER, fontWeight: '700', fontSize: 14 },
  actionBtnCancel:     { backgroundColor: SLATE + '30' },
  actionBtnCancelText: { color: WHITE, fontSize: 14 },
});
