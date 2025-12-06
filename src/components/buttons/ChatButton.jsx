/**
 *
 */

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { t } from 'ttag';

import {
  hideAllWindowTypes,
  openChatWindow,
} from '../../store/actions/windows.js';
import {
  selectChatWindowStatus,
} from '../../store/selectors/windows.js';

const ChatButton = () => {
  const [unreadAny, setUnreadAny] = useState(false);

  const dispatch = useDispatch();

  /*
   * [ chatOpen: if any chat window or modal is open,
   *   chatHidden: if any chat windows are hidden ]
   */
  const [chatOpen, chatHidden] = useSelector(
    selectChatWindowStatus, shallowEqual,
  );
  const chatNotify = useSelector((state) => state.gui.chatNotify);
  const channels = useSelector((state) => state.chat.channels);
  const [unread, mute] = useSelector((state) => [
    state.chatRead.unread,
    state.chatRead.mute,
  ], shallowEqual);

  /*
   * almost the same as in ChannelDropDown
   * just cares about chatNotify too
   */
  useEffect(() => {
    if (!chatNotify || chatOpen) {
      setUnreadAny(false);
      return;
    }
    const cids = Object.keys(channels);
    let i = 0;
    while (i < cids.length) {
      const cid = cids[i];
      if (
        channels[cid][1] !== 0
        && unread[cid]
        && !mute.includes(cid)
      ) {
        setUnreadAny(true);
        break;
      }
      i += 1;
    }
    if (i === cids.length) {
      setUnreadAny(false);
    }
  }, [chatNotify, chatOpen, channels, unread, mute]);

  return (
    <div
      id="chatbutton"
      className="actionbuttons"
      onClick={() => {
        if (chatOpen) {
          dispatch(hideAllWindowTypes('CHAT', true));
        } else if (chatHidden) {
          dispatch(hideAllWindowTypes('CHAT', false));
        } else {
          dispatch(openChatWindow());
        }
      }}
      role="button"
      title={(chatOpen) ? t`Close Chat` : t`Open Chat`}
      tabIndex={0}
    >
      {(unreadAny) && (
        <div
          style={{
            position: 'fixed',
            bottom: 27,
            right: 62,
            top: 'unset',
          }}
          className="chnunread"
        >⦿</div>
      )}
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet" style={{ verticalAlign: '-0.125em' }}>
        <path d="M17 3.33782C15.5291 2.48697 13.8214 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22C17.5228 22 22 17.5228 22 12C22 10.1786 21.513 8.47087 20.6622 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 12H8.009M11.991 12H12M15.991 12H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  );
};

export default React.memo(ChatButton);
