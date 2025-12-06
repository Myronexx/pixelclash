/*
 * Admintools
 */

import React, {
  useState, useEffect, useCallback,
} from 'react';
import { t } from 'ttag';
import { USERLVL } from '../core/constants.js';

import DeleteList from './DeleteList.jsx';
import AnnouncementBar from './AnnouncementBar.jsx';
import { api } from '../utils/utag.js';
import {
  requestFactionAdminList,
  requestFactionAdminDelete,
} from '../store/actions/fetch.js';

async function submitIPAction(
  action,
  valList,
  callback,
) {
  const data = new FormData();
  data.append('ipaction', action);
  data.append('ip', valList);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  callback(await resp.text());
}

async function getModList(callback) {
  const data = new FormData();
  data.append('modlist', true);
  const resp = await fetch(api`/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  callback(await resp.json());
}

function Admintools() {
  const [modName, setModName] = useState('');
  const [vipName, setVipName] = useState('');
  const [remModId, setRemModId] = useState('');
  const [ipResp, setIpResp] = useState('');
  const [mods, setMods] = useState([]);

  const reloadMods = useCallback(() => {
    getModList(setMods);
  }, []);

  useEffect(() => {
    reloadMods();
  }, [reloadMods]);

  const assignMod = async () => {
    const data = new FormData();
    data.append('makemod', modName);
    const resp = await fetch(api`/api/modtools`, {
      method: 'POST',
      credentials: 'include',
      body: data,
    });
    alert(await resp.text());
    reloadMods();
  };

  const assignVip = async () => {
    const data = new FormData();
    data.append('makevip', vipName);

    const resp = await fetch(api`/api/modtools`, {
      method: 'POST',
      credentials: 'include',
      body: data,
    });

    alert(await resp.text());
  };

  const removeMod = async () => {
    const data = new FormData();
    data.append('remmod', remModId);
    const resp = await fetch(api`/api/modtools`, {
      method: 'POST',
      credentials: 'include',
      body: data,
    });
    alert(await resp.text());
    reloadMods();
  };

  return (
    <div>

      <h3>Manage Moderators</h3>
      <DeleteList
        title="Remove Moderator"
        items={mods}
        onDelete={(id) => {
          setRemModId(id);
          removeMod();
        }}
      />

      <div>
        <h3>Assign new Mod</h3>
        <label>Enter UserName of new Mod:</label>
        <input
          type="text"
          value={modName}
          onChange={(e) => setModName(e.target.value)}
        />
        <button onClick={assignMod}>Submit</button>
      </div>

      <br />

      {/* ---------------- VIP EKLEME BÖLÜMÜ ---------------- */}
      <h3>Assign VIP</h3>
      <div>
        <label>Enter UserName of new VIP:</label>
        <input
          type="text"
          value={vipName}
          onChange={(e) => setVipName(e.target.value)}
        />
        <button onClick={assignVip}>Submit</button>
      </div>
      {/* ----------------------------------------------------- */}

      <br />

      <h3>Quick Actions</h3>
      <DeleteList
        title="IP Actions"
        onDelete={(val) => {
          submitIPAction('cleanerstat', val, setIpResp);
        }}
      />
      <p>{ipResp}</p>
    </div>
  );
}

export default React.memo(Admintools);
