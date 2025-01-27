// Copyright (C) 2024 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import m from 'mithril';
import {duration, time} from '../base/time';
import {Optional} from '../base/utils';
import {UntypedEventSet} from '../core/event_set';
import {LegacySelection, Selection} from '../core/selection_manager';
import {Size, VerticalBounds} from '../base/geom';
import {TimeScale} from '../frontend/time_scale';
import {HighPrecisionTimeSpan} from '../common/high_precision_time_span';

export interface TrackContext {
  // This track's URI, used for making selections et al.
  readonly trackUri: string;
}

/**
 * Contextual information about the track passed to track lifecycle hooks &
 * render hooks with additional information about the timeline/canvas.
 */
export interface TrackRenderContext extends TrackContext {
  /**
   * The time span of the visible window.
   */
  readonly visibleWindow: HighPrecisionTimeSpan;

  /**
   * The dimensions of the track on the canvas in pixels.
   */
  readonly size: Size;

  /**
   * Suggested data resolution.
   *
   * This number is the number of time units that corresponds to 1 pixel on the
   * screen, rounded down to the nearest power of 2. The minimum value is 1.
   *
   * It's up to the track whether it would like to use this resolution or
   * calculate their own based on the timespan and the track dimensions.
   */
  readonly resolution: duration;

  /**
   * Canvas context used for rendering.
   */
  readonly ctx: CanvasRenderingContext2D;

  /**
   * A time scale used for translating between pixels and time.
   */
  readonly timescale: TimeScale;
}

// A definition of a track, including a renderer implementation and metadata.
export interface TrackDescriptor {
  // A unique identifier for this track.
  readonly uri: string;

  // A factory function returning a new track instance.
  readonly track: Track;

  // Human readable title. Always displayed.
  readonly title: string;

  // Human readable subtitle. Sometimes displayed if there is room.
  readonly subtitle?: string;

  // Optional: A list of tags used for sorting, grouping and "chips".
  readonly tags?: TrackTags;

  readonly chips?: ReadonlyArray<string>;

  readonly pluginId?: string;

  // Optional: A details panel to use when this track is selected.
  readonly detailsPanel?: TrackSelectionDetailsPanel;

  // Optional: method to look up the start and duration of an event on this track
  readonly getEventBounds?: (
    id: number,
  ) => Promise<Optional<{ts: time; dur: duration}>>;
}

export interface LegacyDetailsPanel {
  render(selection: LegacySelection): m.Children;
  isLoading?(): boolean;
}

export interface DetailsPanel {
  render(selection: Selection): m.Children;
  isLoading?(): boolean;
}

export interface TrackSelectionDetailsPanel {
  render(id: number): m.Children;
  isLoading?(): boolean;
}

/**
 * Contextual information passed to mouse events.
 */
export interface TrackMouseEvent {
  /**
   * X coordinate of the mouse event w.r.t. the top-left of the track.
   */
  readonly x: number;

  /**
   * Y coordinate of the mouse event w.r.t the top-left of the track.
   */
  readonly y: number;

  /**
   * A time scale used for translating between pixels and time.
   */
  readonly timescale: TimeScale;
}

export interface Track {
  /**
   * Optional lifecycle hook called on the first render cycle. Should be used to
   * create any required resources.
   *
   * These lifecycle hooks are asynchronous, but they are run synchronously,
   * meaning that perfetto will wait for each one to complete before calling the
   * next one, so the user doesn't have to serialize these calls manually.
   *
   * Exactly when this hook is called is left purposely undefined. The only
   * guarantee is that it will be called exactly once before the first call to
   * onUpdate().
   *
   * Note: On the first render cycle, both onCreate and onUpdate are called one
   * after another.
   */
  onCreate?(ctx: TrackContext): Promise<void>;

  /**
   * Optional lifecycle hook called on every render cycle.
   *
   * The track should inspect things like the visible window, track size, and
   * resolution to work out whether any data needs to be reloaded based on these
   * properties and perform a reload.
   */
  onUpdate?(ctx: TrackRenderContext): Promise<void>;

  /**
   * Optional lifecycle hook called when the track is no longer visible. Should
   * be used to clear up any resources.
   */
  onDestroy?(): Promise<void>;

  /**
   * Required method used to render the track's content to the canvas, called
   * synchronously on every render cycle.
   */
  render(ctx: TrackRenderContext): void;
  onFullRedraw?(): void;

  /**
   * Return the vertical bounds (top & bottom) of a slice were it to be rendered
   * at a specific depth, given the slice height and padding/spacing that this
   * track uses.
   */
  getSliceVerticalBounds?(depth: number): Optional<VerticalBounds>;
  getHeight(): number;
  getTrackShellButtons?(): m.Children;
  onMouseMove?(event: TrackMouseEvent): void;
  onMouseClick?(event: TrackMouseEvent): boolean;
  onMouseOut?(): void;

  /**
   * Optional: Get the event set that represents this track's data.
   */
  getEventSet?(): UntypedEventSet;
}

// An set of key/value pairs describing a given track. These are used for
// selecting tracks to pin/unpin, diplsaying "chips" in the track shell, and
// (in future) the sorting and grouping of tracks.
// We define a handful of well known fields, and the rest are arbitrary key-
// value pairs.
export type TrackTags = Partial<WellKnownTrackTags> & {
  // There may be arbitrary other key/value pairs.
  [key: string]:
    | undefined
    | string
    | number
    | boolean
    | ReadonlyArray<string>
    | ReadonlyArray<number>;
};

interface WellKnownTrackTags {
  // The track "kind", used by various subsystems e.g. aggregation controllers.
  // This is where "XXX_TRACK_KIND" values should be placed.
  // TODO(stevegolton): This will be deprecated once we handle group selections
  // in a more generic way - i.e. EventSet.
  kind: string;

  // Optional: list of track IDs represented by this trace.
  // This list is used for participation in track indexing by track ID.
  // This index is used by various subsystems to find links between tracks based
  // on the track IDs used by trace processor.
  trackIds: ReadonlyArray<number>;

  // Optional: The CPU number associated with this track.
  cpu: number;

  // Optional: The UTID associated with this track.
  utid: number;

  // Optional: The UPID associated with this track.
  upid: number;

  // Used for sorting and grouping
  scope: string;

  // Group name, used as a hint to ask track decider to put this in a group
  groupName: string;
}
