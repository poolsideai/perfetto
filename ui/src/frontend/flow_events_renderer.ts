// Copyright (C) 2020 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use size file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {ArrowHeadStyle, drawBezierArrow} from '../base/canvas/bezier_arrow';
import {Size, Vector} from '../base/geom';
import {Optional} from '../base/utils';

import {ALL_CATEGORIES, getFlowCategories} from './flow_events_panel';
import {Flow, globals} from './globals';
import {RenderedPanelInfo} from './panel_container';
import {PxSpan, TimeScale} from './time_scale';
import {TrackNode} from '../public/workspace';

const TRACK_GROUP_CONNECTION_OFFSET = 5;
const TRIANGLE_SIZE = 5;
const CIRCLE_RADIUS = 3;
const BEZIER_OFFSET = 30;

const CONNECTED_FLOW_HUE = 10;
const SELECTED_FLOW_HUE = 230;

const DEFAULT_FLOW_WIDTH = 2;
const FOCUSED_FLOW_WIDTH = 3;

const HIGHLIGHTED_FLOW_INTENSITY = 45;
const FOCUSED_FLOW_INTENSITY = 55;
const DEFAULT_FLOW_INTENSITY = 70;

type VerticalEdgeOrPoint =
  | ({kind: 'vertical_edge'} & Vector)
  | ({kind: 'point'} & Vector);

/**
 * Renders the flows overlay on top of the timeline, given the set of panels and
 * a canvas to draw on.
 *
 * Note: the actual flow data is retrieved from globals, which are produced by
 * the flow events controller.
 *
 * @param ctx - The canvas to draw on.
 * @param size - The size of the canvas.
 * @param panels - A list of panels and their locations on the canvas.
 */
export function renderFlows(
  ctx: CanvasRenderingContext2D,
  size: Size,
  panels: ReadonlyArray<RenderedPanelInfo>,
): void {
  const timescale = new TimeScale(
    globals.timeline.visibleWindow,
    new PxSpan(0, size.width),
  );

  // Create indexes for the tracks and groups by key for quick access
  const trackPanelsByKey = new Map(
    panels.map((panel) => [panel.panel.trackUri, panel]),
  );
  const groupPanelsByKey = new Map(
    panels.map((panel) => [panel.panel.groupUri, panel]),
  );

  // Build a track index on trackIds. Note: We need to find the track nodes
  // specifically here (not just the URIs) because we might need to navigate up
  // the tree to find containing groups.

  const trackIdToTrack = new Map<number, TrackNode>();
  globals.workspace.flatTracks.forEach((track) =>
    globals.trackManager
      .getTrack(track.uri)
      ?.tags?.trackIds?.forEach((trackId) =>
        trackIdToTrack.set(trackId, track),
      ),
  );

  const drawFlow = (flow: Flow, hue: number) => {
    const flowStartTs =
      flow.flowToDescendant || flow.begin.sliceStartTs >= flow.end.sliceStartTs
        ? flow.begin.sliceStartTs
        : flow.begin.sliceEndTs;

    const flowEndTs = flow.end.sliceStartTs;

    const startX = timescale.timeToPx(flowStartTs);
    const endX = timescale.timeToPx(flowEndTs);

    // If the flow is entirely outside the visible viewport don't render anything
    if (
      (startX < 0 || startX > size.width) &&
      (endX < 0 || startX > size.width)
    ) {
      return;
    }

    const highlighted =
      flow.end.sliceId === globals.state.highlightedSliceId ||
      flow.begin.sliceId === globals.state.highlightedSliceId;
    const focused =
      flow.id === globals.state.focusedFlowIdLeft ||
      flow.id === globals.state.focusedFlowIdRight;

    let intensity = DEFAULT_FLOW_INTENSITY;
    let width = DEFAULT_FLOW_WIDTH;
    if (focused) {
      intensity = FOCUSED_FLOW_INTENSITY;
      width = FOCUSED_FLOW_WIDTH;
    }
    if (highlighted) {
      intensity = HIGHLIGHTED_FLOW_INTENSITY;
    }

    const start = getConnectionTarget(
      flow.begin.trackId,
      flow.begin.depth,
      startX,
    );
    const end = getConnectionTarget(flow.end.trackId, flow.end.depth, endX);

    if (start && end) {
      drawArrow(ctx, start, end, intensity, hue, width);
    }
  };

  const getConnectionTarget = (
    trackId: number,
    depth: number,
    x: number,
  ): Optional<VerticalEdgeOrPoint> => {
    const track = trackIdToTrack.get(trackId);
    if (!track) {
      return undefined;
    }

    const trackPanel = trackPanelsByKey.get(track.uri);
    if (trackPanel) {
      const trackRect = trackPanel.rect;
      const sliceRectRaw = trackPanel.panel.getSliceVerticalBounds?.(depth);
      if (sliceRectRaw) {
        const sliceRect = {
          top: sliceRectRaw.top + trackRect.top,
          bottom: sliceRectRaw.bottom + trackRect.top,
        };
        return {
          kind: 'vertical_edge',
          x,
          y: (sliceRect.top + sliceRect.bottom) / 2,
        };
      } else {
        // Slice bounds are not available for this track, so just put the target
        // in the middle of the track
        return {
          kind: 'vertical_edge',
          x,
          y: (trackRect.top + trackRect.bottom) / 2,
        };
      }
    } else {
      // If we didn't find a track, it might inside a group, so check for the group
      const group = track.closestVisibleAncestor;
      const groupPanel = group && groupPanelsByKey.get(group.uri);
      if (groupPanel) {
        return {
          kind: 'point',
          x,
          y: groupPanel.rect.bottom - TRACK_GROUP_CONNECTION_OFFSET,
        };
      }
    }

    return undefined;
  };

  // Render the connected flows
  globals.connectedFlows.forEach((flow) => {
    drawFlow(flow, CONNECTED_FLOW_HUE);
  });

  // Render the selected flows
  globals.selectedFlows.forEach((flow) => {
    const categories = getFlowCategories(flow);
    for (const cat of categories) {
      if (
        globals.visibleFlowCategories.get(cat) ||
        globals.visibleFlowCategories.get(ALL_CATEGORIES)
      ) {
        drawFlow(flow, SELECTED_FLOW_HUE);
        break;
      }
    }
  });
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: VerticalEdgeOrPoint,
  end: VerticalEdgeOrPoint,
  intensity: number,
  hue: number,
  width: number,
): void {
  ctx.strokeStyle = `hsl(${hue}, 50%, ${intensity}%)`;
  ctx.fillStyle = `hsl(${hue}, 50%, ${intensity}%)`;
  ctx.lineWidth = width;

  // TODO(stevegolton): Consider vertical distance too
  const roomForArrowHead = Math.abs(start.x - end.x) > 3 * TRIANGLE_SIZE;

  let startStyle: ArrowHeadStyle;
  if (start.kind === 'vertical_edge') {
    startStyle = {
      orientation: 'east',
      shape: 'none',
    };
  } else {
    startStyle = {
      orientation: 'auto_vertical',
      shape: 'circle',
      size: CIRCLE_RADIUS,
    };
  }

  let endStyle: ArrowHeadStyle;
  if (end.kind === 'vertical_edge') {
    endStyle = {
      orientation: 'west',
      shape: roomForArrowHead ? 'triangle' : 'none',
      size: TRIANGLE_SIZE,
    };
  } else {
    endStyle = {
      orientation: 'auto_vertical',
      shape: 'circle',
      size: CIRCLE_RADIUS,
    };
  }

  drawBezierArrow(ctx, start, end, BEZIER_OFFSET, startStyle, endStyle);
}
