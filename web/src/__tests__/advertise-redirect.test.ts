import { readFileSync } from "fs";
import { join } from "path";
import nextConfig from "../../next.config";

describe("public /advertise CTA", () => {
  it("permanently redirects /advertise and /advertise/ to /advertisers in next.config", async () => {
    const redirects = await nextConfig.redirects!();
    const advertise = redirects.filter((r) => r.source.startsWith("/advertise"));

    expect(advertise).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/advertise",
          destination: "/advertisers",
          permanent: true,
        }),
        expect.objectContaining({
          source: "/advertise/",
          destination: "/advertisers",
          permanent: true,
        }),
      ])
    );
    expect(advertise).toHaveLength(2);
  });

  it("declares Vercel-edge 301s for /advertise and /advertise/", () => {
    const vercel = JSON.parse(
      readFileSync(join(__dirname, "../../vercel.json"), "utf8")
    ) as {
      redirects: Array<{ source: string; destination: string; statusCode: number }>;
    };

    expect(vercel.redirects).toEqual(
      expect.arrayContaining([
        {
          source: "/advertise",
          destination: "/advertisers",
          statusCode: 301,
        },
        {
          source: "/advertise/",
          destination: "/advertisers",
          statusCode: 301,
        },
      ])
    );
  });
});
