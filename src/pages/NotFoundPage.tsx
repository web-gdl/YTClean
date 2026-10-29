import { routes } from '../app/router';
import { S } from '../app/strings';
import { Link } from '../components/Link';

export function NotFoundPage() {
  return (
    <div className="page">
      <h1 className="page__title">{S.notFound.title}</h1>
      <p>{S.notFound.body}</p>
      <p>
        <Link className="button" to={routes.home()}>
          {S.notFound.home}
        </Link>
      </p>
    </div>
  );
}
