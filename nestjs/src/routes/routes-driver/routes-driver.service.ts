import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRouteDriverDto } from '../dto/create-routeDriver.dto';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { DirectionsResponseData } from '@googlemaps/google-maps-services-js';
import { Counter } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class RoutesDriverService {
  constructor(
    private prismaService: PrismaService,
    @InjectQueue('kafka-producer') private kafkaProducerQueue: Queue,
    @InjectMetric('route_started_counter')
    private routeStartedCounter: Counter,
    @InjectMetric('route_finished_counter')
    private routeFinishedCounter: Counter,
  ) {}

  async createOrUpdate(dto: CreateRouteDriverDto) {
    const countRouteDriver = await this.prismaService.routeDriver.count({
      where: {
        route_id: dto.route_id,
      },
    });

    const routeDriver = await this.prismaService.routeDriver.upsert({
      include: {
        route: true,
      },
      where: {
        route_id: dto.route_id,
      },
      create: {
        route_id: dto.route_id,
        points: {
          set: {
            location: {
              lat: dto.lat,
              lng: dto.lng,
            },
          },
        },
      },
      update: {
        points: {
          push: {
            location: {
              lat: dto.lat,
              lng: dto.lng,
            },
          },
        },
      },
    });

    if (countRouteDriver === 0) {
      this.routeStartedCounter.inc();
      this.kafkaProducerQueue.add({
        event: 'RouteStarted',
        id: routeDriver.route.id,
        name: routeDriver.route.name,
        lat: dto.lat,
        lng: dto.lng,
        started_at: new Date().toISOString(),
      });
      return routeDriver;
    }

    const directions: DirectionsResponseData = JSON.parse(
      routeDriver.route.directions as string,
    );

    const lastPoint =
      directions.routes[0].legs[0].steps[
        directions.routes[0].legs[0].steps.length - 1
      ];

    if (
      lastPoint.end_location.lat === dto.lat &&
      lastPoint.end_location.lng === dto.lng
    ) {
      this.routeFinishedCounter.inc();
      await this.kafkaProducerQueue.add({
        event: 'RouteFinished',
        id: routeDriver.route.id,
        name: routeDriver.route.name,
        lat: dto.lat,
        lng: dto.lng,
        finished_at: new Date().toISOString(),
      });

      return routeDriver;
    }

    this.kafkaProducerQueue.add({
      event: 'DriverMoved',
      id: routeDriver.route.id,
      name: routeDriver.route.name,
      lat: dto.lat,
      lng: dto.lng,
    });

    return routeDriver;
  }
}
