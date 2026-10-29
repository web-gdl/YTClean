import { S } from '../app/strings';
import inventory from '../../docs/conexiones.json';

interface HostEntry {
  host: string;
  kind: string;
  when: string;
  data: string;
}
interface UserEntry {
  name: string;
  kind: string;
  when: string;
  data: string;
}
interface StorageEntry {
  where: string;
  what: string;
  when: string;
  delete: string;
}

const hosts = inventory.hosts as HostEntry[];
const userConfigured = inventory.userConfigured as UserEntry[];
const storage = inventory.storage as StorageEntry[];
const never = inventory.nunca;

export function PrivacyPage() {
  const kindLabel = (k: string) => (S.privacy.kinds as Record<string, string>)[k] ?? k;
  return (
    <div className="page page--privacy">
      <h1 className="page__title">{S.privacy.title}</h1>
      <p>{S.privacy.intro}</p>

      <h2 className="section__title">{S.privacy.principles}</h2>
      <ul className="list">
        {S.privacy.principlesList.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h2 className="section__title">{S.privacy.connections}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{S.privacy.columns.host}</th>
              <th scope="col">{S.privacy.columns.when}</th>
              <th scope="col">{S.privacy.columns.data}</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((h) => (
              <tr key={h.host}>
                <th scope="row">
                  <code>{h.host}</code>
                  <br />
                  <span className="tag">{kindLabel(h.kind)}</span>
                </th>
                <td>{h.when}</td>
                <td>{h.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section__title">{S.privacy.userConfigured}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{S.privacy.columns.host}</th>
              <th scope="col">{S.privacy.columns.when}</th>
              <th scope="col">{S.privacy.columns.data}</th>
            </tr>
          </thead>
          <tbody>
            {userConfigured.map((u) => (
              <tr key={u.name}>
                <th scope="row">
                  {u.name}
                  <br />
                  <span className="tag">{kindLabel(u.kind)}</span>
                </th>
                <td>{u.when}</td>
                <td>{u.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section__title">{S.privacy.storage}</h2>
      <ul className="list">
        {storage.map((s) => (
          <li key={s.where}>
            <strong>{s.where}:</strong> {s.what} <em>{s.when}</em> {s.delete}
          </li>
        ))}
      </ul>

      <h2 className="section__title">{S.privacy.cookies}</h2>
      <p>{inventory.cookies}</p>

      <h2 className="section__title">{S.privacy.never}</h2>
      <ul className="list">
        {never.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <h2 className="section__title">{S.privacy.limits}</h2>
      <ul className="list">
        {S.privacy.limitsList.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
